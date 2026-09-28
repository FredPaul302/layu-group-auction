import type { BidTier } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), siteSetting: { findUnique: vi.fn() } }
}));
vi.mock("@/lib/prisma", () => mocks);
vi.mock("@/lib/notifications/workflow-events", () => ({
  sendFixedPriceReservationCreatedNotification: vi.fn(), sendOrderCompletedNotification: vi.fn(),
  sendOrderPaidNotification: vi.fn(), sendOrderReadyForFulfillmentNotification: vi.fn(),
  sendRunnerUpOfferSentNotification: vi.fn()
}));

import { placeBidOnListing } from "../src/lib/auctions/service";
import { respondToRunnerUpOffer } from "../src/lib/auctions/runner-up-offers";
import { claimFixedPriceListing, getOrCreatePayFirstOrder } from "../src/lib/orders/service";

const now = new Date("2026-09-13T12:00:00Z");

function transaction(input: { level: 1 | 2 | 3; tier?: BidTier; blocked?: boolean; price?: number; requiredTier?: BidTier }) {
  const buyer = { id: "buyer_1", role: "bidder", email: "buyer@example.com", emailVerifiedAtUtc: now,
    bidderProfile: { maxBidTier: input.tier ?? "tier_0", isBlocked: input.blocked ?? false, nonPaymentStrikeCount: 0 } };
  const listing = { id: "listing_1", title: "Vintage game", listingType: "fixed_price", status: "published", fixedPriceCents: input.price ?? 10000, fulfillmentMode: "pickup_only", shippingFeeCents: 0, pickupEventId: "pickup_1", category: { requiredBidTier: input.requiredTier ?? "tier_0" }, auction: { id: "auction_1", status: "live", endAtUtc: new Date("2026-09-14T12:00:00Z"), startingBidCents: 100, currentHighestBidCents: null, currentHighestBidderId: null, minimumIncrementCents: 100 } };
  const tx = {
    siteSetting: { findUnique: vi.fn(async () => ({ launchAccessEnabled: false, verificationLevel: input.level, emailOnlyLimitCents: 10000 })) },
    user: { findUnique: vi.fn(async () => buyer) },
    listing: { findFirst: vi.fn(async () => listing), updateMany: vi.fn(async () => ({ count: 1 })) },
    order: { findFirst: vi.fn(async () => null), create: vi.fn(async (args: { data: object }) => ({ id: "order_1", ...args.data })) },
    bid: { updateMany: vi.fn(), create: vi.fn(async (args: { data: object }) => ({ id: "bid_1", ...args.data })) },
    auction: { update: vi.fn() },
    runnerUpOffer: {
      findFirst: vi.fn(async () => ({ id: "offer_1", status: "pending", expiresAtUtc: new Date("2026-09-14T12:00:00Z"), order: null, offeredToUser: buyer, bid: { amountCents: input.price ?? 10000 }, auction: { listing } })),
      updateMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ id: "offer_1", status: "accepted" }))
    }
  };
  mocks.prisma.$transaction.mockImplementation(async (callback: (db: typeof tx) => unknown) => callback(tx));
  return { tx, listing };
}

describe("verification policy transaction enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.siteSetting.findUnique.mockResolvedValue({ defaultWinnerPaymentWindowHours: 48 });
  });

  it("rejects a submitted bid above the cap even when the current minimum is below it", async () => {
    const { tx, listing } = transaction({ level: 1 });
    listing.listingType = "auction";
    await expect(placeBidOnListing({ listingId: listing.id, bidderUserId: "buyer_1", amountCents: 10001, now })).rejects.toMatchObject({ code: "email_only_limit_exceeded" });
    expect(tx.siteSetting.findUnique).toHaveBeenCalled();
    expect(tx.bid.create).not.toHaveBeenCalled();
  });

  it("accepts an email-only bid for a seeded deposit-tier category within the saved level 1 limit", async () => {
    const { tx, listing } = transaction({ level: 1, requiredTier: "tier_1" });
    listing.listingType = "auction";
    await placeBidOnListing({ listingId: listing.id, bidderUserId: "buyer_1", amountCents: 10000, now });
    expect(tx.bid.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 10000, placedAtUtc: now }) }));
  });

  it.each([claimFixedPriceListing, getOrCreatePayFirstOrder])("allows deposit-free Buy It Now even with strict auction settings", async (action) => {
    const { tx } = transaction({ level: 3 });
    expect((await action({ listingId: "listing_1", buyerUserId: "buyer_1", now })).id).toBe("order_1");
    expect(tx.order.create).toHaveBeenCalled();
  });

  it.each([claimFixedPriceListing, getOrCreatePayFirstOrder])("accepts an eligible level 1 fixed-price order", async (action) => {
    const { tx } = transaction({ level: 1, requiredTier: "tier_20" });
    const result = await action({ listingId: "listing_1", buyerUserId: "buyer_1", now });
    expect(result.id).toBe("order_1");
    expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subtotalCents: 10000, paymentDeadlineAtUtc: new Date("2026-09-15T12:00:00Z") }) }));
  });

  it("rechecks the current level when accepting an older runner-up offer", async () => {
    const { tx } = transaction({ level: 3 });
    await expect(respondToRunnerUpOffer({ offerId: "offer_1", userId: "buyer_1", decision: "accept", now })).rejects.toMatchObject({ code: "secondary_verification_required" });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("accepts an eligible level 1 runner-up offer", async () => {
    const { tx } = transaction({ level: 1 });
    expect((await respondToRunnerUpOffer({ offerId: "offer_1", userId: "buyer_1", decision: "accept", now })).order?.id).toBe("order_1");
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("keeps a blocked account from accepting offers after protection is reduced", async () => {
    const { tx } = transaction({ level: 1, blocked: true });
    await expect(respondToRunnerUpOffer({ offerId: "offer_1", userId: "buyer_1", decision: "accept", now })).rejects.toMatchObject({ code: "bidder_blocked" });
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});
