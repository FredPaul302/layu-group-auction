import { formatMoney } from "@/lib/money";

export type DepositTierSettings = {
  depositTier1Cents: number;
  depositTier2Cents: number;
  launchAuctionLimitCents: number;
};

export const defaultDepositTierSettings: DepositTierSettings = {
  depositTier1Cents: 100,
  depositTier2Cents: 2000,
  launchAuctionLimitCents: 4000
};

export function getDepositTierSettings(settings?: Partial<DepositTierSettings>): DepositTierSettings {
  return {
    depositTier1Cents: settings?.depositTier1Cents ?? defaultDepositTierSettings.depositTier1Cents,
    depositTier2Cents: settings?.depositTier2Cents ?? defaultDepositTierSettings.depositTier2Cents,
    launchAuctionLimitCents: settings?.launchAuctionLimitCents ?? defaultDepositTierSettings.launchAuctionLimitCents
  };
}

export function getDepositTierOptions(settings?: Partial<DepositTierSettings> & { launchAccessEnabled?: boolean }) {
  const tiers = getDepositTierSettings(settings);
  return settings?.launchAccessEnabled
    ? [tiers.depositTier1Cents]
    : [tiers.depositTier1Cents, tiers.depositTier2Cents];
}

export function formatDepositTierLabel(tier: string, settings?: Partial<DepositTierSettings>) {
  const tiers = getDepositTierSettings(settings);
  if (tier === "tier_1" || tier === "tier_10") return `${formatMoney(tiers.depositTier1Cents)} tier`;
  if (tier === "tier_20") return `${formatMoney(tiers.depositTier2Cents)} tier`;
  return tier === "full" ? "Full identity verification" : "No deposit tier";
}
