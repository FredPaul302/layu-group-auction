import type { BidTier, DepositStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getCommerceVerificationReason, defaultVerificationPolicy } from "../src/lib/verification/policy";
import { deriveActiveApprovedDepositAmountCents, isSupportedDepositAmount } from "../src/lib/verification";
import { getFixedPriceClaimGate } from "../src/lib/orders/rules";
import { getAuctionBidGate } from "../src/lib/auctions/rules";
import { validateListingInput } from "../src/lib/catalog";
import { parseAnnouncementVideo } from "../src/lib/verification/announcement-video";

const now = new Date("2026-09-14T12:00:00Z");
const buyer = (hold = 0, tier: BidTier = "tier_0") => ({ id: "buyer", role: "bidder" as const,
  emailVerifiedAtUtc: now, bidderProfile: { isBlocked: false, maxBidTier: tier, activeHoldAmountCents: hold, nonPaymentStrikeCount: 0 } });
const auction = { status: "live", endAtUtc: new Date("2026-09-15T12:00:00Z"), currentHighestBidCents: 3000 };
const snapshot = { listingType: "auction" as const, listingStatus: "published" as const,
  fixedPriceCents: 10000, requiredBidTier: "full" as const, fulfillmentMode: "shipping_only" as const,
  shippingFeeCents: 1200, auction };

describe("launch access", () => {
  it.each(["tier_0", "tier_1", "tier_10", "tier_20", "full"] as BidTier[])("opens bids through $40 in %s categories without a deposit", (requiredBidTier) => {
    for (const amountCents of [1, 3999, 4000]) expect(getCommerceVerificationReason({ subject: buyer(), requiredBidTier, amountCents })).toBeNull();
    expect(getCommerceVerificationReason({ subject: buyer(), requiredBidTier, amountCents: 4001 })).toBe("secondary_verification_required");
  });
  it.each(["draft", "pending_review", "rejected", "refunded", "released", "forfeited"] as DepositStatus[])("does not count a %s deposit", (status) => {
    const hold = deriveActiveApprovedDepositAmountCents([{ status, amountCents: 2000 }]);
    expect(getCommerceVerificationReason({ subject: buyer(hold), requiredBidTier: "full", amountCents: 4001 })).toBe("secondary_verification_required");
  });
  it("honors existing approved balances without requiring a deposit for each item", () => {
    for (const hold of [100, 500, 1000, 2000]) for (const amountCents of [4001, 250000]) {
      expect(getCommerceVerificationReason({ subject: buyer(hold), requiredBidTier: "full", amountCents })).toBeNull();
    }
    expect(getCommerceVerificationReason({ subject: buyer(99), requiredBidTier: "tier_1", amountCents: 4001 })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ subject: buyer(0, "full"), requiredBidTier: "full", amountCents: 4001 })).toBe("secondary_verification_required");
  });
  it.each(["auction", "buy_it_now"] as const)("keeps email, blocks and non-payment restrictions for %s", (action) => {
    const base = { requiredBidTier: "full" as const, amountCents: 100, action };
    expect(getCommerceVerificationReason({ ...base, subject: null })).toBe("authentication_required");
    expect(getCommerceVerificationReason({ ...base, subject: { ...buyer(2000), emailVerifiedAtUtc: null } })).toBe("email_verification_required");
    for (const restrictions of [{ isBlocked: true }, { nonPaymentStrikeCount: 1 }]) expect(getCommerceVerificationReason({ ...base, subject: { ...buyer(2000), bidderProfile: { ...buyer(2000).bidderProfile, ...restrictions } } })).toBe("bidder_blocked");
  });
  it("checks the submitted bid when the auction crosses $40", () => {
    const input = { subject: buyer(), now, snapshot: { listingType: "auction" as const, listingStatus: "published" as const, auctionStatus: "live" as const, endAtUtc: auction.endAtUtc, startingBidCents: 100, currentHighestBidCents: 3900, minimumIncrementCents: 100, requiredBidTier: "tier_20" as const } };
    expect(getAuctionBidGate(input).canBid).toBe(true);
    expect(getAuctionBidGate({ ...input, amountCents: 4001 }).reason).toBe("secondary_verification_required");
    expect(getAuctionBidGate({ ...input, amountCents: 4001, subject: buyer(100) }).canBid).toBe(true);
  });
  it("keeps Buy It Now deposit-free at every price and even after launch", () => {
    for (const fixedPriceCents of [100, 4000, 4001, 1000000]) for (const launchAccessEnabled of [true, false]) {
      expect(getFixedPriceClaimGate({ subject: buyer(), snapshot: { ...snapshot, listingType: "fixed_price", fixedPriceCents }, policy: { ...defaultVerificationPolicy, launchAccessEnabled }, now }).canClaim).toBe(true);
    }
  });
  it("consolidates new deposit amounts without treating old values as new tiers", () => {
    expect([100, 2000].every((amount) => isSupportedDepositAmount(amount))).toBe(true);
    expect([99, 500, 1000, 100.5].some((amount) => isSupportedDepositAmount(amount))).toBe(false);
  });
});

describe("combined listing rules", () => {
  it("allows Buy It Now during live bidding before the advertised price is reached", () => {
    expect(getFixedPriceClaimGate({ subject: buyer(), snapshot, now }).canClaim).toBe(true);
  });
  it("closes Buy It Now when reserved, expired, ended, or bidding reaches its price", () => {
    for (const change of [{ listingStatus: "sold_pending_payment" as const }, { fixedPriceCents: null }, { auction: null },
      { auction: { ...auction, status: "ended" } }, { auction: { ...auction, endAtUtc: now } },
      { auction: { ...auction, currentHighestBidCents: 10000 } }]) {
      expect(getFixedPriceClaimGate({ subject: buyer(), snapshot: { ...snapshot, ...change }, now }).reason).toBe("listing_unavailable");
    }
  });
  it("saves both prices and rejects a Buy It Now price at or below the starting bid", () => {
    const input = { title: "Combined item", categoryId: "category", listingType: "auction" as const,
      fulfillmentMode: "pickup_only" as const, shippingFeeCents: 0, startingBidCents: 1000,
      endAtUtc: auction.endAtUtc, saveAs: "draft" as const, categoryMinimumStartBidCents: 100, categoryMinimumBidIncrementCents: 100 };
    expect(validateListingInput({ ...input, fixedPriceCents: 5000 })).toMatchObject({ fixedPriceCents: 5000, startingBidCents: 1000 });
    for (const fixedPriceCents of [0, 999, 1000, 1000.5]) expect(() => validateListingInput({ ...input, fixedPriceCents })).toThrow(/Buy It Now price/u);
    expect(validateListingInput(input).fixedPriceCents).toBeNull();
  });
});

describe("announcement video", () => {
  it("supports YouTube and hosted files while leaving the text independent", () => {
    expect(parseAnnouncementVideo("")).toBeNull();
    expect(parseAnnouncementVideo("https://youtu.be/abcDEF123_-?t=3")?.src).toBe("https://www.youtube-nocookie.com/embed/abcDEF123_-");
    expect(parseAnnouncementVideo("https://market.layu.llc/uploads/launch.mp4")?.kind).toBe("hosted");
  });
  it.each(["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=abcDEF123_-", "https://youtube.com/watch?v=oops", "http://example.com/video.mp4", "https://user:pass@example.com/v.mp4", "https://example.com/page"])("rejects invalid video input %s", (url) => {
    expect(() => parseAnnouncementVideo(url)).toThrow();
  });
});
