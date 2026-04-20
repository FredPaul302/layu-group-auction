import { describe, expect, it } from "vitest";

import { canParticipateInCommerce } from "../src/lib/permissions/index.js";
import {
  deriveActiveApprovedDepositAmountCents,
  deriveVerificationEligibility
} from "../src/lib/verification/index.js";

describe("verification eligibility", () => {
  it("grants full verification eligibility to approved Persona users", () => {
    const eligibility = deriveVerificationEligibility({
      isBlocked: false,
      nonPaymentStrikeCount: 0,
      personaStatus: "approved",
      activeApprovedDepositAmountCents: 0
    });

    expect(eligibility.isVerificationEligible).toBe(true);
    expect(eligibility.maxBidTier).toBe("full");
    expect(eligibility.source).toBe("persona");
  });

  it("derives tier-based eligibility from approved deposit holds only", () => {
    const activeApprovedDepositAmountCents = deriveActiveApprovedDepositAmountCents([
      { amountCents: 500, status: "approved" },
      { amountCents: 500, status: "approved" },
      { amountCents: 2000, status: "rejected" }
    ]);

    const eligibility = deriveVerificationEligibility({
      isBlocked: false,
      nonPaymentStrikeCount: 0,
      personaStatus: null,
      activeApprovedDepositAmountCents
    });

    expect(activeApprovedDepositAmountCents).toBe(1000);
    expect(eligibility.isVerificationEligible).toBe(true);
    expect(eligibility.maxBidTier).toBe("tier_10");
    expect(eligibility.source).toBe("deposit");
  });

  it("allows commerce access once email and secondary verification are present", () => {
    const subject = {
      id: "user_123",
      role: "bidder" as const,
      emailVerifiedAtUtc: new Date().toISOString(),
      bidderProfile: {
        isBlocked: false,
        maxBidTier: "full" as const,
        nonPaymentStrikeCount: 0
      }
    };

    expect(canParticipateInCommerce(subject)).toBe(true);
  });

  it("removes eligibility for non-paying bidders even with approved deposits", () => {
    const eligibility = deriveVerificationEligibility({
      isBlocked: false,
      nonPaymentStrikeCount: 1,
      personaStatus: null,
      activeApprovedDepositAmountCents: 2000
    });

    expect(eligibility.isVerificationEligible).toBe(false);
    expect(eligibility.maxBidTier).toBe("tier_0");
    expect(eligibility.source).toBe("none");
  });
});
