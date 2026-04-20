import type { DepositStatus, PersonaVerificationStatus } from "@prisma/client";

export type VerificationPath = "persona" | "deposit";

export type DepositTierCents = 500 | 1000 | 2000;

export type BidTier = "tier_0" | "tier_5" | "tier_10" | "tier_20" | "full";
export type SecondaryVerificationSource = "none" | "deposit" | "persona";
export type DepositReviewDecision = "approve" | "reject" | "refund" | "forfeit";

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

export function isSupportedDepositAmount(amountCents: number): amountCents is DepositTierCents {
  return depositTierOptions.includes(amountCents as DepositTierCents);
}

export function deriveBidTierFromDepositAmount(amountCents: number): Exclude<BidTier, "full"> {
  if (!isSupportedDepositAmount(amountCents)) {
    return "tier_0";
  }

  return deriveBidTierFromActiveHoldAmount(amountCents);
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

export function deriveActiveApprovedDepositAmountCents(
  deposits: Array<{
    status: DepositStatus;
    amountCents: number;
  }>
) {
  return deposits.reduce((total, deposit) => {
    if (deposit.status !== "approved") {
      return total;
    }

    return total + deposit.amountCents;
  }, 0);
}

export function deriveVerificationEligibility(input: {
  isBlocked: boolean;
  nonPaymentStrikeCount?: number;
  personaStatus: PersonaVerificationStatus | null;
  activeApprovedDepositAmountCents: number;
}) {
  if (input.isBlocked || (input.nonPaymentStrikeCount ?? 0) > 0) {
    return {
      isVerificationEligible: false,
      maxBidTier: "tier_0" as BidTier,
      source: "none" as SecondaryVerificationSource
    };
  }

  if (input.personaStatus === "approved") {
    return {
      isVerificationEligible: true,
      maxBidTier: "full" as BidTier,
      source: "persona" as SecondaryVerificationSource
    };
  }

  const depositTier = deriveBidTierFromActiveHoldAmount(input.activeApprovedDepositAmountCents);

  if (depositTier === "tier_0") {
    return {
      isVerificationEligible: false,
      maxBidTier: depositTier,
      source: "none" as SecondaryVerificationSource
    };
  }

  return {
    isVerificationEligible: true,
    maxBidTier: depositTier,
    source: "deposit" as SecondaryVerificationSource
  };
}

export function mapDepositReviewDecisionToStatus(decision: DepositReviewDecision): DepositStatus {
  switch (decision) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "refund":
      return "refunded";
    case "forfeit":
      return "forfeited";
  }
}

export function canApplyDepositReviewDecision(
  currentStatus: DepositStatus,
  decision: DepositReviewDecision
) {
  if (currentStatus === "pending_review") {
    return decision === "approve" || decision === "reject";
  }

  if (currentStatus === "approved") {
    return decision === "refund" || decision === "forfeit";
  }

  return false;
}
