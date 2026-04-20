import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { DomainJobInput, DomainJobResult } from "../jobs/types";
import {
  resolveExpiredAuction,
  type CloseAuctionBidRecord
} from "./rules";

export type CloseExpiredAuctionJobCandidate = {
  auctionId: string;
  listingId: string;
  auctionStatus: "live" | "ended" | "awaiting_payment" | "ended_no_bids" | "archived";
  listingStatus:
    | "draft"
    | "published"
    | "ended"
    | "sold_pending_payment"
    | "paid"
    | "ready_for_fulfillment"
    | "fulfilled"
    | "unsold"
    | "archived";
  endAtUtc: Date;
  listingShippingFeeCents: number;
  fulfillmentMode: "pickup_only" | "shipping_only" | "pickup_or_shipping";
  bids: CloseAuctionBidRecord[];
  existingAuctionWinOrderId?: string | null;
};

export type CloseExpiredAuctionsInput = DomainJobInput & {
  now?: Date;
  paymentWindowHours?: number;
  candidates?: CloseExpiredAuctionJobCandidate[];
};

async function getWinnerPaymentWindowHours() {
  const siteSetting = await prisma.siteSetting.findUnique({
    where: {
      id: 1
    },
    select: {
      defaultWinnerPaymentWindowHours: true
    }
  });

  return siteSetting?.defaultWinnerPaymentWindowHours ?? 48;
}

async function listExpiredLiveAuctionCandidates(
  now: Date
): Promise<CloseExpiredAuctionJobCandidate[]> {
  const auctions = await prisma.auction.findMany({
    where: {
      status: "live",
      endAtUtc: {
        lt: now
      },
      listing: {
        status: "published",
        listingType: "auction"
      }
    },
    select: {
      id: true,
      status: true,
      endAtUtc: true,
      listingId: true,
      listing: {
        select: {
          id: true,
          status: true,
          shippingFeeCents: true,
          fulfillmentMode: true,
          orders: {
            where: {
              source: "auction_win"
            },
            take: 1,
            select: {
              id: true
            }
          }
        }
      },
      bids: {
        select: {
          id: true,
          bidderUserId: true,
          amountCents: true,
          placedAtUtc: true,
          status: true
        },
        orderBy: [{ amountCents: "desc" }, { placedAtUtc: "asc" }]
      }
    }
  });

  return auctions.map((auction) => ({
    auctionId: auction.id,
    listingId: auction.listingId,
    auctionStatus: auction.status,
    listingStatus: auction.listing.status,
    endAtUtc: auction.endAtUtc,
    listingShippingFeeCents: auction.listing.shippingFeeCents,
    fulfillmentMode: auction.listing.fulfillmentMode,
    bids: auction.bids,
    existingAuctionWinOrderId: auction.listing.orders[0]?.id ?? null
  }));
}

async function applyResolvedExpiredAuction(input: {
  candidate: CloseExpiredAuctionJobCandidate;
  now: Date;
  paymentWindowHours: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const freshAuction = await transaction.auction.findUnique({
      where: {
        id: input.candidate.auctionId
      },
      select: {
        id: true,
        listingId: true,
        status: true,
        endAtUtc: true,
        listing: {
          select: {
            id: true,
            status: true,
            shippingFeeCents: true,
            fulfillmentMode: true,
            orders: {
              where: {
                source: "auction_win"
              },
              take: 1,
              select: {
                id: true
              }
            }
          }
        },
        bids: {
          select: {
            id: true,
            bidderUserId: true,
            amountCents: true,
            placedAtUtc: true,
            status: true
          },
          orderBy: [{ amountCents: "desc" }, { placedAtUtc: "asc" }]
        }
      }
    });

    if (!freshAuction || freshAuction.listing.status !== "published") {
      return {
        processed: false
      };
    }

    const resolution = resolveExpiredAuction({
      auctionStatus: freshAuction.status,
      endAtUtc: freshAuction.endAtUtc,
      listingShippingFeeCents: freshAuction.listing.shippingFeeCents,
      fulfillmentMode: freshAuction.listing.fulfillmentMode,
      bids: freshAuction.bids,
      paymentWindowHours: input.paymentWindowHours,
      now: input.now,
      existingAuctionWinOrderId: freshAuction.listing.orders[0]?.id ?? null
    });

    if (!resolution.shouldClose) {
      return {
        processed: false
      };
    }

    if (resolution.outcome === "ended_no_bids") {
      await transaction.auction.update({
        where: {
          id: freshAuction.id
        },
        data: {
          status: resolution.auctionStatus,
          closedAtUtc: resolution.closedAtUtc,
          currentHighestBidCents: null,
          currentHighestBidderId: null
        }
      });

      await transaction.listing.update({
        where: {
          id: freshAuction.listing.id
        },
        data: {
          status: resolution.listingStatus
        }
      });

      return {
        processed: true
      };
    }

    await transaction.bid.updateMany({
      where: {
        auctionId: freshAuction.id,
        status: "winning"
      },
      data: {
        status: "outbid",
        isWinning: false
      }
    });

    await transaction.bid.update({
      where: {
        id: resolution.winningBid.id
      },
      data: {
        status: "winning",
        isWinning: true
      }
    });

    if (resolution.orderDraft) {
      try {
        await transaction.order.create({
          data: {
            listingId: freshAuction.listing.id,
            buyerUserId: resolution.orderDraft.buyerUserId,
            winningBidId: resolution.winningBid.id,
            source: "auction_win",
            status: "awaiting_payment",
            subtotalCents: resolution.orderDraft.subtotalCents,
            shippingFeeCents: resolution.orderDraft.shippingFeeCents,
            totalCents: resolution.orderDraft.totalCents,
            selectedFulfillmentMode: resolution.orderDraft.selectedFulfillmentMode,
            paymentDeadlineAtUtc: resolution.orderDraft.paymentDeadlineAtUtc
          }
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
      }
    }

    await transaction.auction.update({
      where: {
        id: freshAuction.id
      },
      data: {
        status: resolution.auctionStatus,
        closedAtUtc: resolution.closedAtUtc,
        currentHighestBidCents: resolution.winningBid.amountCents,
        currentHighestBidderId: resolution.winningBid.bidderUserId
      }
    });

    await transaction.listing.update({
      where: {
        id: freshAuction.listing.id
      },
      data: {
        status: resolution.listingStatus
      }
    });

    return {
      processed: true
    };
  });
}

export async function closeExpiredAuctions(
  input: CloseExpiredAuctionsInput = {}
): Promise<DomainJobResult> {
  const now = input.now ?? new Date();
  const paymentWindowHours =
    input.paymentWindowHours ??
    (input.candidates ? 48 : await getWinnerPaymentWindowHours());
  const candidates = input.candidates ?? (await listExpiredLiveAuctionCandidates(now));
  let processedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
    const resolution = resolveExpiredAuction({
      auctionStatus: candidate.auctionStatus,
      endAtUtc: candidate.endAtUtc,
      listingShippingFeeCents: candidate.listingShippingFeeCents,
      fulfillmentMode: candidate.fulfillmentMode,
      bids: candidate.bids,
      paymentWindowHours,
      now,
      existingAuctionWinOrderId: candidate.existingAuctionWinOrderId ?? null
    });

    if (!resolution.shouldClose) {
      skippedCount += 1;
      continue;
    }

    if (input.dryRun || input.candidates) {
      processedCount += 1;
      continue;
    }

    const persisted = await applyResolvedExpiredAuction({
      candidate,
      now,
      paymentWindowHours
    });

    if (persisted.processed) {
      processedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return {
    jobName: "auctions.closeExpired",
    status: "completed",
    dryRun: input.dryRun ?? false,
    processedCount,
    skippedCount,
    timestampUtc: now.toISOString(),
    notes: [
      `Resolved ${processedCount} expired live auction(s).`,
      `Skipped ${skippedCount} auction(s) that no longer required closing.`
    ]
  };
}
