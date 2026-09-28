import { describe, expect, it } from "vitest";

import {
  deriveBidTierFromActiveHoldAmount,
  deriveMaxBidTier,
  hasTierAccess
} from "../src/lib/verification/index.js";

describe("verification tier derivation", () => {
  it("derives deposit-based bid tiers from active hold amount", () => {
    expect(deriveBidTierFromActiveHoldAmount(0)).toBe("tier_0");
    expect(deriveBidTierFromActiveHoldAmount(99)).toBe("tier_0");
    expect(deriveBidTierFromActiveHoldAmount(100)).toBe("tier_1");
    expect(deriveBidTierFromActiveHoldAmount(1000)).toBe("tier_1");
    expect(deriveBidTierFromActiveHoldAmount(2000)).toBe("tier_20");
    expect(deriveBidTierFromActiveHoldAmount(2500)).toBe("tier_20");
  });

  it("upgrades to full tier when Persona is approved", () => {
    expect(
      deriveMaxBidTier({
        isPersonaApproved: true,
        activeHoldAmountCents: 0
      })
    ).toBe("full");

    expect(
      deriveMaxBidTier({
        isPersonaApproved: true,
        activeHoldAmountCents: 500
      })
    ).toBe("full");
  });

  it("compares tier access correctly", () => {
    expect(hasTierAccess("tier_20", "tier_10")).toBe(true);
    expect(hasTierAccess("tier_1", "tier_20")).toBe(false);
    expect(hasTierAccess("full", "tier_20")).toBe(true);
  });
});
