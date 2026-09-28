import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deriveBidTierFromActiveHoldAmount, deriveVerificationEligibility, isSupportedDepositAmount } from "../src/lib/verification";
import { describeVerificationPolicy, getCommerceVerificationReason, parseVerificationPolicyInput } from "../src/lib/verification/policy";
import { formatDepositTierLabel, getDepositTierOptions } from "../src/lib/verification/tiers";
import { LaunchAnnouncement } from "../src/components/launch-announcement";

const policy = { verificationLevel: 3 as const, emailOnlyLimitCents: 10000, launchAccessEnabled: true,
  depositTier1Cents: 250, depositTier2Cents: 2550, launchAuctionLimitCents: 5050 };
const subject = (hold: number, maxBidTier = "tier_20" as "tier_0" | "tier_1" | "tier_20" | "full") => ({
  id: "buyer", role: "bidder" as const, emailVerifiedAtUtc: new Date(),
  bidderProfile: { maxBidTier, activeHoldAmountCents: hold, isBlocked: false }
});

describe("editable deposit tiers", () => {
  it("uses the current launch threshold and actual approved hold after a tier edit", () => {
    const input = { policy, requiredBidTier: "full" as const, subject: subject(100), amountCents: 5050 };
    expect(getCommerceVerificationReason(input)).toBeNull();
    expect(getCommerceVerificationReason({ ...input, amountCents: 5051 })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ ...input, subject: subject(250), amountCents: 5051 })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, action: "buy_it_now", amountCents: 999999 })).toBeNull();
  });
  it("recomputes category access from the held amount instead of a stale cached tier", () => {
    const input = { policy: { ...policy, launchAccessEnabled: false }, requiredBidTier: "tier_20" as const, amountCents: 10000 };
    expect(getCommerceVerificationReason({ ...input, subject: subject(2000) })).toBe("tier_access_required");
    expect(getCommerceVerificationReason({ ...input, subject: subject(100) })).toBe("secondary_verification_required");
    expect(getCommerceVerificationReason({ ...input, subject: subject(2550, "tier_0") })).toBeNull();
    expect(getCommerceVerificationReason({ ...input, subject: subject(0, "full") })).toBeNull();
    expect(deriveBidTierFromActiveHoldAmount(2000, policy)).toBe("tier_1");
    expect(deriveVerificationEligibility({ policy, isBlocked: false, personaStatus: null, activeApprovedDepositAmountCents: 2550 }).maxBidTier).toBe("tier_20");
  });
  it("only offers the first tier during launch and never creates obsolete tier amounts", () => {
    expect(getDepositTierOptions(policy)).toEqual([250]);
    expect(getDepositTierOptions({ ...policy, launchAccessEnabled: false })).toEqual([250, 2550]);
    expect(isSupportedDepositAmount(100, policy)).toBe(false);
    expect(isSupportedDepositAmount(250, policy)).toBe(true);
    expect(isSupportedDepositAmount(2550, policy)).toBe(false);
  });
  it("validates ordered, exact deposit amounts and permits an all-bids deposit threshold", () => {
    expect(parseVerificationPolicyInput({ ...policy, launchAuctionLimitCents: 0 })).toMatchObject({ depositTier1Cents: 250, depositTier2Cents: 2550, launchAuctionLimitCents: 0 });
    for (const change of [{ depositTier1Cents: 0 }, { depositTier1Cents: 2.5 }, { depositTier2Cents: 250 }, { depositTier2Cents: 100_000_001 }, { launchAuctionLimitCents: -1 }]) {
      expect(() => parseVerificationPolicyInput({ ...policy, ...change })).toThrow();
    }
    expect(() => parseVerificationPolicyInput({ verificationLevel: 3, emailOnlyLimitCents: 10000, depositTier1Cents: 100 })).toThrow();
  });
  it("updates the announcement, tier labels and explanation with standard dollar formatting", () => {
    expect(formatDepositTierLabel("tier_10", policy)).toBe("$2.50 tier");
    expect(formatDepositTierLabel("tier_20", policy)).toBe("$25.50 tier");
    const explanation = describeVerificationPolicy(policy);
    expect(explanation).toContain("$50.50");
    expect(explanation).toContain("$2.50");
    const html = renderToStaticMarkup(<LaunchAnnouncement policy={policy} />);
    expect(html).toContain("$25.50");
    expect(html).not.toContain("$40");
  });
});
