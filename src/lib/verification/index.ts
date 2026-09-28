import type { DepositStatus, PersonaVerificationStatus } from "@prisma/client";
import { getDepositTierOptions, getDepositTierSettings, type DepositTierSettings } from "./tiers";

export type VerificationPath = "persona" | "deposit";

export type DepositTierCents = number;

export type BidTier = "tier_0" | "tier_1" | "tier_10" | "tier_20" | "full";
export type SecondaryVerificationSource = "none" | "email" | "deposit" | "persona";
export type DepositReviewDecision = "approve" | "reject" | "refund" | "forfeit";

export class VerificationActionError extends Error {
  constructor(
    public readonly code:
      | "deposit_amount_invalid"
      | "deposit_method_invalid"
      | "deposit_submission_invalid"
      | "deposit_submission_not_found"
      | "deposit_already_submitted"
      | "deposit_review_invalid"
      | "bidder_flag_reason_required",
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "VerificationActionError";
  }
}

export const depositTierOptions: DepositTierCents[] = [100, 2000];

export const bidTierRanks: Record<BidTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_10: 1,
  tier_20: 3,
  full: 4
};

export function deriveBidTierFromActiveHoldAmount(
  activeHoldAmountCents: number,
  settings?: Partial<DepositTierSettings>
): Exclude<BidTier, "full"> {
  const tiers = getDepositTierSettings(settings);
  if (activeHoldAmountCents >= tiers.depositTier2Cents) {
    return "tier_20";
  }

  if (activeHoldAmountCents >= tiers.depositTier1Cents) {
    return "tier_1";
  }

  return "tier_0";
}

export function isSupportedDepositAmount(amountCents: number, settings?: Partial<DepositTierSettings> & { launchAccessEnabled?: boolean }): amountCents is DepositTierCents {
  return Number.isSafeInteger(amountCents) && getDepositTierOptions(settings).includes(amountCents);
}

export function deriveBidTierFromDepositAmount(amountCents: number, settings?: Partial<DepositTierSettings>): Exclude<BidTier, "full"> {
  if (!isSupportedDepositAmount(amountCents, settings)) {
    return "tier_0";
  }

  return deriveBidTierFromActiveHoldAmount(amountCents, settings);
}

export function deriveMaxBidTier(input: {
  isPersonaApproved: boolean;
  activeHoldAmountCents: number;
  policy?: Partial<DepositTierSettings>;
}): BidTier {
  if (input.isPersonaApproved) {
    return "full";
  }

  return deriveBidTierFromActiveHoldAmount(input.activeHoldAmountCents, input.policy);
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
  emailIsVerified?: boolean;
  allowEmailOnly?: boolean;
  policy?: Partial<DepositTierSettings>;
}) {
  if (input.isBlocked || (input.nonPaymentStrikeCount ?? 0) > 0 || input.emailIsVerified === false) {
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

  const depositTier = deriveBidTierFromActiveHoldAmount(input.activeApprovedDepositAmountCents, input.policy);

  if (depositTier === "tier_0") {
    return {
      isVerificationEligible: Boolean(input.allowEmailOnly && input.emailIsVerified),
      maxBidTier: depositTier,
      source: (input.allowEmailOnly && input.emailIsVerified ? "email" : "none") as SecondaryVerificationSource
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
