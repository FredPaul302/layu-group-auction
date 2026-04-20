export type VerificationPath = "persona" | "deposit";

export type DepositTierCents = 500 | 1000 | 2000;

export type BidTier = "tier_0" | "tier_5" | "tier_10" | "tier_20" | "full";

export const depositTierOptions: DepositTierCents[] = [500, 1000, 2000];

export const bidTierRanks: Record<BidTier, number> = {
  tier_0: 0,
  tier_5: 1,
  tier_10: 2,
  tier_20: 3,
  full: 4
};

export function deriveBidTierFromActiveHoldAmount(
  activeHoldAmountCents: number
): Exclude<BidTier, "full"> {
  if (activeHoldAmountCents >= 2000) {
    return "tier_20";
  }

  if (activeHoldAmountCents >= 1000) {
    return "tier_10";
  }

  if (activeHoldAmountCents >= 500) {
    return "tier_5";
  }

  return "tier_0";
}

export function deriveMaxBidTier(input: {
  isPersonaApproved: boolean;
  activeHoldAmountCents: number;
}): BidTier {
  if (input.isPersonaApproved) {
    return "full";
  }

  return deriveBidTierFromActiveHoldAmount(input.activeHoldAmountCents);
}

export function hasTierAccess(currentTier: BidTier, requiredTier: BidTier) {
  return bidTierRanks[currentTier] >= bidTierRanks[requiredTier];
}
