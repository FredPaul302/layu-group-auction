import type { BidTier } from "@prisma/client";

import { hasVerifiedEmail, isAuthenticated, isCommerceRestricted, type PermissionSubject } from "@/lib/permissions";
import { deriveBidTierFromActiveHoldAmount, hasTierAccess } from "./index";
import { formatMoney } from "@/lib/money";
import { defaultDepositTierSettings, getDepositTierSettings, type DepositTierSettings } from "./tiers";

export type VerificationLevel = 1 | 2 | 3;
export type VerificationPolicy = Partial<DepositTierSettings> & {
  launchAccessEnabled?: boolean;
  verificationLevel: VerificationLevel;
  emailOnlyLimitCents: number;
};

export const launchAuctionLimitCents = 4000;

// Launch access applies across categories; the saved levels remain available for later.
export const defaultVerificationPolicy: VerificationPolicy = {
  ...defaultDepositTierSettings,
  launchAccessEnabled: true,
  verificationLevel: 3,
  emailOnlyLimitCents: 10_000
};

export type CommerceVerificationReason =
  | "authentication_required"
  | "email_verification_required"
  | "bidder_blocked"
  | "secondary_verification_required"
  | "tier_access_required"
  | "email_only_limit_exceeded";

export function normalizeVerificationPolicy(settings?: Partial<DepositTierSettings> & {
  launchAccessEnabled?: boolean;
  verificationLevel?: number;
  emailOnlyLimitCents?: number;
} | null): VerificationPolicy {
  const limit = settings?.emailOnlyLimitCents;
  return {
    ...getDepositTierSettings(settings ?? undefined),
    launchAccessEnabled: settings?.launchAccessEnabled ?? true,
    verificationLevel: settings?.verificationLevel === 1 || settings?.verificationLevel === 2
      ? settings.verificationLevel : 3,
    emailOnlyLimitCents: typeof limit === "number" && Number.isSafeInteger(limit) &&
      limit >= 100 && limit <= 100_000_000 ? limit : defaultVerificationPolicy.emailOnlyLimitCents
  };
}

export function getCommerceVerificationReason(input: {
  subject: PermissionSubject;
  requiredBidTier: BidTier;
  amountCents: number;
  policy?: VerificationPolicy;
  action?: "auction" | "buy_it_now";
}): CommerceVerificationReason | null {
  if (!isAuthenticated(input.subject)) return "authentication_required";
  if (!hasVerifiedEmail(input.subject)) return "email_verification_required";
  // Restriction flags always take precedence, even when secondary checks are off.
  if (isCommerceRestricted(input.subject)) return "bidder_blocked";

  // Buying at the advertised price never requires a verification deposit.
  if (input.action === "buy_it_now") return null;

  const policy = input.policy ?? defaultVerificationPolicy;
  const tiers = getDepositTierSettings(policy);
  if (policy.launchAccessEnabled) {
    if (Number.isSafeInteger(input.amountCents) && input.amountCents > 0 &&
      input.amountCents <= tiers.launchAuctionLimitCents) return null;
    return (input.subject.bidderProfile?.activeHoldAmountCents ?? 0) >= tiers.depositTier1Cents
      ? null : "secondary_verification_required";
  }
  const profile = input.subject.bidderProfile;
  // Re-evaluate the actual approved hold for every action; saved tier labels can
  // predate an admin edit. Hosted identity approval remains independent of deposits.
  const currentTier = profile?.maxBidTier === "full" ? "full"
    : typeof profile?.activeHoldAmountCents === "number"
      ? deriveBidTierFromActiveHoldAmount(profile.activeHoldAmountCents, policy)
      : profile?.maxBidTier ?? "tier_0";

  if (currentTier !== "tier_0" && hasTierAccess(currentTier, input.requiredBidTier)) return null;

  // Level 2 permits a confirmed deposit to cover more categories for low-value items.
  // Categories explicitly requiring full identity verification remain protected.
  if (policy.verificationLevel <= 2 && currentTier !== "tier_0" &&
    input.requiredBidTier !== "full" && Number.isSafeInteger(input.amountCents) &&
    input.amountCents > 0 && input.amountCents <= policy.emailOnlyLimitCents) return null;

  if (policy.verificationLevel === 1 && input.requiredBidTier !== "full") {
    return Number.isSafeInteger(input.amountCents) && input.amountCents > 0 &&
      input.amountCents <= policy.emailOnlyLimitCents ? null : "email_only_limit_exceeded";
  }

  return currentTier === "tier_0" ? "secondary_verification_required" : "tier_access_required";
}

export function describeVerificationPolicy(policy: VerificationPolicy) {
  const tiers = getDepositTierSettings(policy);
  const first = formatMoney(tiers.depositTier1Cents);
  const second = formatMoney(tiers.depositTier2Cents);
  const auctionLimit = formatMoney(tiers.launchAuctionLimitCents);
  if (policy.launchAccessEnabled) {
    return `Confirm your email to buy or bid. Buy It Now never requires a deposit, at any price. Auction bids of ${auctionLimit} or less need no deposit; bids over ${auctionLimit} require at least ${first} in approved deposits on your account. The ${second} tier is reserved for later.`;
  }
  if (policy.verificationLevel === 1) {
    const limit = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
      .format(policy.emailOnlyLimitCents / 100);
    return `Verified email allows auction bids up to ${limit} per item in categories that do not require full identity verification. Above this limit, the usual approved deposit or identity tier is required. Identity-only categories still require hosted identity verification. Buy It Now never requires a deposit.`;
  }
  if (policy.verificationLevel === 2) {
    const limit = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
      .format(policy.emailOnlyLimitCents / 100);
    return `Auction bidding requires verified email plus approved deposits totaling at least ${first}, or hosted identity verification. The deposit tiers are ${first} and ${second}. The first tier allows bids up to ${limit} across deposit-tier categories; usual category tiers apply above that. Identity-only categories still require hosted identity verification. Buy It Now never requires a deposit. A confirmed deposit does not prove identity.`;
  }
  return `Verified email plus approved deposits at the category's required tier (${first} or ${second}), or hosted identity verification, is required for new bids and runner-up offers. Buy It Now never requires a deposit.`;
}

export class VerificationPolicyInputError extends Error {}

export function parseVerificationPolicyInput(input: {
  launchAccessEnabled?: unknown;
  verificationLevel: unknown;
  emailOnlyLimitCents: unknown;
  depositTier1Cents?: unknown;
  depositTier2Cents?: unknown;
  launchAuctionLimitCents?: unknown;
}): VerificationPolicy {
  const level = String(input.verificationLevel ?? "");
  const cents = String(input.emailOnlyLimitCents ?? "");
  if (!["1", "2", "3"].includes(level)) {
    throw new VerificationPolicyInputError("Choose verification level 1, 2, or 3.");
  }
  if (!/^\d+$/u.test(cents) || !Number.isSafeInteger(Number(cents)) ||
    Number(cents) < 100 || Number(cents) > 100_000_000) {
    throw new VerificationPolicyInputError("Enter a reduced-verification per-item limit from $1.00 to $1,000,000.00.");
  }
  const tierChanges: Partial<DepositTierSettings> = {};
  const keys = ["depositTier1Cents", "depositTier2Cents", "launchAuctionLimitCents"] as const;
  if (keys.some((key) => input[key] !== undefined)) {
    for (const key of keys) {
      const value = String(input[key] ?? "");
      if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) ||
        Number(value) < (key === "launchAuctionLimitCents" ? 0 : 1) || Number(value) > 100_000_000) {
        throw new VerificationPolicyInputError("Enter both deposit amounts and the auction limit in dollars, up to $1,000,000.00. Deposits must be at least $0.01.");
      }
      tierChanges[key] = Number(value);
    }
    if (tierChanges.depositTier2Cents! <= tierChanges.depositTier1Cents!) {
      throw new VerificationPolicyInputError("The second deposit tier must be greater than the first tier.");
    }
  }
  return {
    ...tierChanges,
    launchAccessEnabled: input.launchAccessEnabled === true || input.launchAccessEnabled === "on",
    verificationLevel: Number(level) as VerificationLevel,
    emailOnlyLimitCents: Number(cents)
  };
}
