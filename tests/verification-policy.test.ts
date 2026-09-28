import type { BidTier } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getAuctionBidGate } from "../src/lib/auctions/rules";
import { getFixedPriceClaimGate, getFixedPricePayFirstGate } from "../src/lib/orders/rules";
import { deriveVerificationEligibility } from "../src/lib/verification";
import { defaultVerificationPolicy, getCommerceVerificationReason, normalizeVerificationPolicy, parseVerificationPolicyInput } from "../src/lib/verification/policy";

const buyer = (tier: BidTier = "tier_0", isBlocked = false, nonPaymentStrikeCount = 0) => ({
  id: "buyer_1", role: "bidder" as const, emailVerifiedAtUtc: new Date("2026-09-01T12:00:00Z"),
  bidderProfile: { maxBidTier: tier, isBlocked, nonPaymentStrikeCount }
});
const policy = (verificationLevel: 1 | 2 | 3) => ({ verificationLevel, emailOnlyLimitCents: 10_000 });

describe("market verification policy", () => {
  it("defaults to launch access while keeping strict auction levels available", () => {
    expect(normalizeVerificationPolicy(null)).toEqual(defaultVerificationPolicy);
    expect(normalizeVerificationPolicy({ verificationLevel: 0, emailOnlyLimitCents: -1 })).toEqual(defaultVerificationPolicy);
    expect(getCommerceVerificationReason({ subject: buyer(), requiredBidTier: "tier_0", amountCents: 100, policy: policy(3) })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ subject: buyer("tier_10"), requiredBidTier: "tier_10", amountCents: 100000, policy: policy(3) })).toBeNull();
    expect(getCommerceVerificationReason({ subject: buyer("full"), requiredBidTier: "full", amountCents: 100000, policy: policy(3) })).toBeNull();
  });

  it("allows verified email at level 1 within the price limit across seeded deposit-tier categories", () => {
    const input = { subject: buyer(), requiredBidTier: "tier_0" as const, policy: policy(1), amountCents: 10_000 };
    expect(getCommerceVerificationReason(input)).toBeNull();
    expect(getCommerceVerificationReason({ ...input, amountCents: 10_001 })).toBe("email_only_limit_exceeded");
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "tier_1" })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "tier_10" })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "tier_20" })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "full" })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "tier_20", amountCents: 10_001 })).toBe("email_only_limit_exceeded");
    expect(getCommerceVerificationReason({ ...input, subject: { ...buyer(), bidderProfile: null } })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, subject: { ...buyer(), emailVerifiedAtUtc: null } })).toBe("email_verification_required");
    expect(getCommerceVerificationReason({ ...input, subject: null })).toBe("authentication_required");
  });

  it.each([0, -100, 100.5, NaN, Infinity])("does not grant reduced-verification access for invalid cent amount %s", (amountCents) => {
    expect(getCommerceVerificationReason({ subject: buyer(), requiredBidTier: "tier_0", amountCents, policy: policy(1) })).toBe("email_only_limit_exceeded");
  });

  it("keeps stronger approvals useful when level 1 is active", () => {
    expect(getCommerceVerificationReason({ subject: buyer("tier_10"), requiredBidTier: "tier_10", amountCents: 50_000, policy: policy(1) })).toBeNull();
    expect(getCommerceVerificationReason({ subject: buyer("full"), requiredBidTier: "full", amountCents: 50_000, policy: policy(1) })).toBeNull();
  });

  it("uses confirmed deposit accountability at level 2 and normal category tiers above the limit", () => {
    const input = { subject: buyer("tier_1"), requiredBidTier: "tier_20" as const, amountCents: 10_000, policy: policy(2) };
    expect(getCommerceVerificationReason(input)).toBeNull();
    expect(getCommerceVerificationReason({ ...input, amountCents: 10_001 })).toBe("tier_access_required");
    expect(getCommerceVerificationReason({ ...input, policy: policy(1) })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, subject: buyer() })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ ...input, policy: policy(3) })).toBe("tier_access_required");
    expect(getCommerceVerificationReason({ ...input, requiredBidTier: "full" })).toBe("tier_access_required");
  });

  it.each([1, 2, 3] as const)("always enforces blocked and nonpayment flags at level %s", (level) => {
    for (const subject of [buyer("tier_0", true), buyer("full", true), buyer("full", false, 1)]) {
      expect(getCommerceVerificationReason({ subject, requiredBidTier: "tier_0", amountCents: 100, policy: policy(level) })).toBe("bidder_blocked");
    }
  });

  it("applies the same policy to claims and pay-first checkout", () => {
    const input = { subject: buyer(), policy: policy(1), snapshot: { listingType: "fixed_price" as const, listingStatus: "published" as const, fixedPriceCents: 10_000, requiredBidTier: "tier_0" as const, fulfillmentMode: "pickup_only" as const, shippingFeeCents: 0 } };
    expect(getFixedPriceClaimGate(input).canClaim).toBe(true);
    expect(getFixedPricePayFirstGate(input).canStartCheckout).toBe(true);
    expect(getFixedPriceClaimGate({ ...input, policy: policy(3) }).canClaim).toBe(true);
    expect(getFixedPricePayFirstGate({ ...input, policy: policy(3) }).canStartCheckout).toBe(true);
  });

  it("checks the submitted bid amount rather than only the next minimum", () => {
    const input = { subject: buyer(), policy: policy(1), now: new Date("2026-09-13T12:00:00Z"), snapshot: { listingType: "auction" as const, listingStatus: "published" as const, auctionStatus: "live" as const, endAtUtc: new Date("2026-09-14T12:00:00Z"), startingBidCents: 100, currentHighestBidCents: null, minimumIncrementCents: 100, requiredBidTier: "tier_0" as const } };
    expect(getAuctionBidGate(input).canBid).toBe(true);
    expect(getAuctionBidGate({ ...input, amountCents: 10_001 }).reason).toBe("email_only_limit_exceeded");
  });

  it("shows email-only eligibility without inventing a deposit approval", () => {
    expect(deriveVerificationEligibility({ isBlocked: false, personaStatus: null, activeApprovedDepositAmountCents: 0, emailIsVerified: true, allowEmailOnly: true })).toEqual({ isVerificationEligible: true, maxBidTier: "tier_0", source: "email" });
    expect(deriveVerificationEligibility({ isBlocked: true, personaStatus: null, activeApprovedDepositAmountCents: 0, emailIsVerified: true, allowEmailOnly: true }).isVerificationEligible).toBe(false);
  });

  it("validates settings without fractional cents or loose numeric coercion", () => {
    expect(parseVerificationPolicyInput({ verificationLevel: "2", emailOnlyLimitCents: "12345" })).toEqual({ launchAccessEnabled: false, verificationLevel: 2, emailOnlyLimitCents: 12345 });
    for (const verificationLevel of ["", "2junk", 0, 4, null]) {
      expect(() => parseVerificationPolicyInput({ verificationLevel, emailOnlyLimitCents: 10000 })).toThrow();
    }
    for (const emailOnlyLimitCents of [0, 99, -1, "1.1", "1e4", "100junk", 100_000_001]) {
      expect(() => parseVerificationPolicyInput({ verificationLevel: 1, emailOnlyLimitCents })).toThrow();
    }
  });
});
