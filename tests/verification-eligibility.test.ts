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
      personaStatus: null,
      activeApprovedDepositAmountCents
    });

    expect(activeApprovedDepositAmountCents).toBe(1000);
    expect(eligibility.isVerificationEligible).toBe(true);
    expect(eligibility.maxBidTier).toBe("tier_10");
    expect(eligibility.source).toBe("deposit");
  });

  it("keeps commerce access locked even when secondary verification is present", () => {
    const subject = {
      id: "user_123",
      role: "bidder" as const,
      emailVerifiedAtUtc: new Date().toISOString(),
      bidderProfile: {
        isBlocked: false,
        maxBidTier: "full" as const
      }
    };

    expect(canParticipateInCommerce(subject)).toBe(false);
  });
});
