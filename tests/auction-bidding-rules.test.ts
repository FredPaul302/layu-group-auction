import { describe, expect, it } from "vitest";

import {
  assertBidAmountCents,
  getAuctionBidGate,
  getCurrentAuctionPriceCents,
  getNextMinimumBidCents
} from "../src/lib/auctions/index.js";

describe("auction bidding rules", () => {
  it("derives the current price and next minimum bid from the auction state", () => {
    expect(
      getCurrentAuctionPriceCents({
        startingBidCents: 1_000,
        currentHighestBidCents: null
      })
    ).toBe(1_000);

    expect(
      getNextMinimumBidCents({
        startingBidCents: 1_000,
        currentHighestBidCents: null,
        minimumIncrementCents: 250
      })
    ).toBe(1_000);

    expect(
      getCurrentAuctionPriceCents({
        startingBidCents: 1_000,
        currentHighestBidCents: 1_500
      })
    ).toBe(1_500);

    expect(
      getNextMinimumBidCents({
        startingBidCents: 1_000,
        currentHighestBidCents: 1_500,
        minimumIncrementCents: 250
      })
    ).toBe(1_750);
  });

  it("rejects bids below the next allowed minimum", () => {
    expect(() => assertBidAmountCents(1_200, 1_250)).toThrowError(/at least 1250 cents/i);
  });

  it("blocks bidding when the bidder tier is below the category requirement", () => {
    const gate = getAuctionBidGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_5"
        }
      },
      snapshot: {
        listingType: "auction",
        listingStatus: "published",
        auctionStatus: "live",
        endAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        startingBidCents: 1_000,
        currentHighestBidCents: null,
        minimumIncrementCents: 250,
        requiredBidTier: "tier_10"
      },
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(gate.canBid).toBe(false);
    expect(gate.reason).toBe("tier_access_required");
  });

  it("allows bidding when verification, tier, and listing state are valid", () => {
    const gate = getAuctionBidGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_20"
        }
      },
      snapshot: {
        listingType: "auction",
        listingStatus: "published",
        auctionStatus: "live",
        endAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        startingBidCents: 1_000,
        currentHighestBidCents: 1_250,
        minimumIncrementCents: 250,
        requiredBidTier: "tier_10"
      },
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(gate.canBid).toBe(true);
    expect(gate.reason).toBeNull();
    expect(gate.currentPriceCents).toBe(1_250);
    expect(gate.nextMinimumBidCents).toBe(1_500);
  });

  it("rejects blocked bidders", () => {
    const gate = getAuctionBidGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: true,
          maxBidTier: "full"
        }
      },
      snapshot: {
        listingType: "auction",
        listingStatus: "published",
        auctionStatus: "live",
        endAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        startingBidCents: 1_000,
        currentHighestBidCents: null,
        minimumIncrementCents: 250,
        requiredBidTier: "tier_5"
      },
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(gate.canBid).toBe(false);
    expect(gate.reason).toBe("bidder_blocked");
  });

  it("requires verified email before bidding", () => {
    const gate = getAuctionBidGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: null,
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "full"
        }
      },
      snapshot: {
        listingType: "auction",
        listingStatus: "published",
        auctionStatus: "live",
        endAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        startingBidCents: 1_000,
        currentHighestBidCents: null,
        minimumIncrementCents: 250,
        requiredBidTier: "tier_5"
      },
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(gate.canBid).toBe(false);
    expect(gate.reason).toBe("email_verification_required");
  });

  it("requires secondary verification before bidding", () => {
    const gate = getAuctionBidGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0"
        }
      },
      snapshot: {
        listingType: "auction",
        listingStatus: "published",
        auctionStatus: "live",
        endAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        startingBidCents: 1_000,
        currentHighestBidCents: null,
        minimumIncrementCents: 250,
        requiredBidTier: "tier_5"
      },
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(gate.canBid).toBe(false);
    expect(gate.reason).toBe("secondary_verification_required");
  });
});
