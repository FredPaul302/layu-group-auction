import type {
  AuctionStatus,
  BidStatus,
  BidTier,
  FulfillmentMode,
  ListingStatus,
  ListingType,
  RunnerUpOfferStatus
} from "@prisma/client";

import {
  hasVerifiedEmail,
  isAuthenticated,
  type PermissionSubject
} from "@/lib/permissions";
import { hasTierAccess } from "@/lib/verification";

export type AuctionBidGateReason =
  | "authentication_required"
  | "email_verification_required"
  | "secondary_verification_required"
  | "bidder_blocked"
  | "tier_access_required"
  | "listing_not_biddable"
  | "auction_not_live"
  | "auction_closed";

export type AuctionBidSnapshot = {
  listingType: ListingType;
  listingStatus: ListingStatus;
  auctionStatus: AuctionStatus;
  endAtUtc: Date;
  startingBidCents: number;
  currentHighestBidCents: number | null;
  minimumIncrementCents: number;
  requiredBidTier: BidTier;
};

export type AuctionBidGate = {
  canBid: boolean;
  reason: AuctionBidGateReason | null;
  currentPriceCents: number;
  nextMinimumBidCents: number;
};

export type CloseAuctionBidRecord = {
  id: string;
  bidderUserId: string;
  amountCents: number;
  placedAtUtc: Date | string;
  status?: BidStatus;
};

export type RunnerUpBidRecord = CloseAuctionBidRecord & {
  existingRunnerUpOfferId?: string | null;
};

export type CloseExpiredAuctionInput = {
  auctionStatus: AuctionStatus;
  endAtUtc: Date;
  listingShippingFeeCents: number;
  fulfillmentMode: FulfillmentMode;
  bids: CloseAuctionBidRecord[];
  paymentWindowHours: number;
  now: Date;
  existingAuctionWinOrderId?: string | null;
};

export type CloseExpiredAuctionResolution =
  | {
      shouldClose: false;
      reason: "not_expired" | "auction_not_live";
    }
  | {
      shouldClose: true;
      outcome: "ended_no_bids";
      auctionStatus: "ended_no_bids";
      listingStatus: "unsold";
      closedAtUtc: Date;
      winningBid: null;
      orderDraft: null;
      orderAlreadyExists: false;
    }
  | {
      shouldClose: true;
      outcome: "awaiting_payment";
      auctionStatus: "awaiting_payment";
      listingStatus: "sold_pending_payment";
      closedAtUtc: Date;
      winningBid: CloseAuctionBidRecord;
      orderDraft: {
        buyerUserId: string;
        subtotalCents: number;
        shippingFeeCents: number;
        totalCents: number;
        paymentDeadlineAtUtc: Date;
        selectedFulfillmentMode: FulfillmentMode | null;
      } | null;
      orderAlreadyExists: boolean;
    };

export class AuctionActionError extends Error {
  constructor(
    public readonly code:
      | AuctionBidGateReason
      | "bid_amount_invalid"
      | "bid_too_low"
      | "auction_listing_required",
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AuctionActionError";
  }
}

export function getCurrentAuctionPriceCents(input: {
  startingBidCents: number;
  currentHighestBidCents: number | null;
}) {
  return input.currentHighestBidCents ?? input.startingBidCents;
}

export function getNextMinimumBidCents(input: {
  startingBidCents: number;
  currentHighestBidCents: number | null;
  minimumIncrementCents: number;
}) {
  if (input.currentHighestBidCents == null) {
    return input.startingBidCents;
  }

  return input.currentHighestBidCents + input.minimumIncrementCents;
}

export function getAuctionBidGate(input: {
  subject: PermissionSubject;
  snapshot: AuctionBidSnapshot;
  now: Date;
}): AuctionBidGate {
  const currentPriceCents = getCurrentAuctionPriceCents(input.snapshot);
  const nextMinimumBidCents = getNextMinimumBidCents(input.snapshot);

  if (
    input.snapshot.listingType !== "auction" ||
    input.snapshot.listingStatus !== "published"
  ) {
    return {
      canBid: false,
      reason: "listing_not_biddable",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (input.snapshot.auctionStatus !== "live") {
    return {
      canBid: false,
      reason: "auction_not_live",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (input.snapshot.endAtUtc.getTime() <= input.now.getTime()) {
    return {
      canBid: false,
      reason: "auction_closed",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (!isAuthenticated(input.subject)) {
    return {
      canBid: false,
      reason: "authentication_required",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (!hasVerifiedEmail(input.subject)) {
    return {
      canBid: false,
      reason: "email_verification_required",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (!input.subject.bidderProfile || input.subject.bidderProfile.maxBidTier === "tier_0") {
    return {
      canBid: false,
      reason: "secondary_verification_required",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (
    input.subject.bidderProfile.isBlocked ||
    (input.subject.bidderProfile.nonPaymentStrikeCount ?? 0) > 0
  ) {
    return {
      canBid: false,
      reason: "bidder_blocked",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  if (!hasTierAccess(input.subject.bidderProfile.maxBidTier, input.snapshot.requiredBidTier)) {
    return {
      canBid: false,
      reason: "tier_access_required",
      currentPriceCents,
      nextMinimumBidCents
    };
  }

  return {
    canBid: true,
    reason: null,
    currentPriceCents,
    nextMinimumBidCents
  };
}

export function assertBidAmountCents(amountCents: number, nextMinimumBidCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AuctionActionError(
      "bid_amount_invalid",
      400,
      "Bid amount must be a positive whole-number cent value."
    );
  }

  if (amountCents < nextMinimumBidCents) {
    throw new AuctionActionError(
      "bid_too_low",
      422,
      `Bid amount must be at least ${nextMinimumBidCents} cents.`
    );
  }
}

export function assertAuctionBidGate(gate: AuctionBidGate) {
  if (gate.canBid) {
    return;
  }

  const errorMessages: Record<AuctionBidGateReason, { statusCode: number; message: string }> = {
    authentication_required: {
      statusCode: 401,
      message: "You must sign in before placing a bid."
    },
    email_verification_required: {
      statusCode: 403,
      message: "Email verification is required before bidding."
    },
    secondary_verification_required: {
      statusCode: 403,
      message: "Secondary verification is required before bidding."
    },
    bidder_blocked: {
      statusCode: 403,
      message: "This bidder account is blocked from bidding."
    },
    tier_access_required: {
      statusCode: 403,
      message: "Your current approved tier does not allow bidding in this category."
    },
    listing_not_biddable: {
      statusCode: 409,
      message: "This listing is not currently open for bidding."
    },
    auction_not_live: {
      statusCode: 409,
      message: "This auction is not currently live."
    },
    auction_closed: {
      statusCode: 409,
      message: "This auction has already ended."
    }
  };

  if (!gate.reason) {
    return;
  }

  const errorDetails = errorMessages[gate.reason];

  throw new AuctionActionError(gate.reason, errorDetails.statusCode, errorDetails.message);
}

function isValidWinningBidStatus(status: BidStatus | undefined) {
  return status == null || status === "active" || status === "outbid" || status === "winning";
}

export function selectWinningBid(bids: CloseAuctionBidRecord[]) {
  const validBids = bids
    .filter((bid) => isValidWinningBidStatus(bid.status))
    .sort((left, right) => {
      if (right.amountCents !== left.amountCents) {
        return right.amountCents - left.amountCents;
      }

      return (
        new Date(left.placedAtUtc).getTime() - new Date(right.placedAtUtc).getTime()
      );
    });

  return validBids[0] ?? null;
}

export function resolveExpiredAuction(
  input: CloseExpiredAuctionInput
): CloseExpiredAuctionResolution {
  if (input.auctionStatus !== "live") {
    return {
      shouldClose: false,
      reason: "auction_not_live"
    };
  }

  if (input.endAtUtc.getTime() > input.now.getTime()) {
    return {
      shouldClose: false,
      reason: "not_expired"
    };
  }

  const winningBid = selectWinningBid(input.bids);

  if (!winningBid) {
    return {
      shouldClose: true,
      outcome: "ended_no_bids",
      auctionStatus: "ended_no_bids",
      listingStatus: "unsold",
      closedAtUtc: input.now,
      winningBid: null,
      orderDraft: null,
      orderAlreadyExists: false
    };
  }

  const shippingFeeCents =
    input.fulfillmentMode === "shipping_only" ? input.listingShippingFeeCents : 0;
  const subtotalCents = winningBid.amountCents;
  const totalCents = subtotalCents + shippingFeeCents;
  const paymentDeadlineAtUtc = new Date(
    input.now.getTime() + input.paymentWindowHours * 60 * 60 * 1000
  );

  return {
    shouldClose: true,
    outcome: "awaiting_payment",
    auctionStatus: "awaiting_payment",
    listingStatus: "sold_pending_payment",
    closedAtUtc: input.now,
    winningBid,
    orderDraft: input.existingAuctionWinOrderId
      ? null
      : {
          buyerUserId: winningBid.bidderUserId,
          subtotalCents,
          shippingFeeCents,
          totalCents,
          paymentDeadlineAtUtc,
          selectedFulfillmentMode:
            input.fulfillmentMode === "pickup_or_shipping" ? null : input.fulfillmentMode
        },
    orderAlreadyExists: Boolean(input.existingAuctionWinOrderId)
  };
}

export function selectRunnerUpBid(input: {
  bids: RunnerUpBidRecord[];
  winningBidId?: string | null;
  winningBidderUserId?: string | null;
}) {
  const bidsByBidder = new Map<string, RunnerUpBidRecord>();

  for (const bid of input.bids) {
    if (!isValidWinningBidStatus(bid.status)) {
      continue;
    }

    if (bid.id === input.winningBidId || bid.bidderUserId === input.winningBidderUserId) {
      continue;
    }

    if (bid.existingRunnerUpOfferId) {
      continue;
    }

    const existing = bidsByBidder.get(bid.bidderUserId);

    if (!existing) {
      bidsByBidder.set(bid.bidderUserId, bid);
      continue;
    }

    if (
      bid.amountCents > existing.amountCents ||
      (bid.amountCents === existing.amountCents &&
        new Date(bid.placedAtUtc).getTime() < new Date(existing.placedAtUtc).getTime())
    ) {
      bidsByBidder.set(bid.bidderUserId, bid);
    }
  }

  return [...bidsByBidder.values()].sort((left, right) => {
    if (right.amountCents !== left.amountCents) {
      return right.amountCents - left.amountCents;
    }

    return new Date(left.placedAtUtc).getTime() - new Date(right.placedAtUtc).getTime();
  })[0] ?? null;
}

export function resolveRunnerUpOfferExpiry(input: {
  status: RunnerUpOfferStatus;
  expiresAtUtc: Date;
  now: Date;
}) {
  if (input.status !== "pending") {
    return {
      shouldExpire: false,
      reason: "status_not_pending" as const
    };
  }

  if (input.expiresAtUtc.getTime() > input.now.getTime()) {
    return {
      shouldExpire: false,
      reason: "deadline_not_reached" as const
    };
  }

  return {
    shouldExpire: true,
    nextStatus: "expired" as RunnerUpOfferStatus
  };
}
