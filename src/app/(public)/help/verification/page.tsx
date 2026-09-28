import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { describeVerificationPolicy } from "@/lib/verification/policy";
import { getVerificationPolicy } from "@/lib/verification/policy-service";
import { formatMoney } from "@/lib/money";
import { getDepositTierSettings } from "@/lib/verification/tiers";

export const dynamic = "force-dynamic";

export default async function HelpVerificationPage() {
  const policy = await getVerificationPolicy();
  const tiers = getDepositTierSettings(policy);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Help" title="Buyer verification" description={<p>{describeVerificationPolicy(policy)}</p>} />
      <section className="surface-card space-y-4 p-6 text-sm text-zinc-700">
        <h3 className="text-lg font-semibold text-zinc-950">Current requirement: {policy.launchAccessEnabled ? "Launch access" : `Level ${policy.verificationLevel}`}</h3>
        <p>Start by confirming your email address. Phone verification is not available yet. Each item shows whether your account can bid or buy under the current category and value requirements.</p>
        <p>{policy.launchAccessEnabled ? `Only the ${formatMoney(tiers.depositTier1Cents)} deposit is available for launch; ${formatMoney(tiers.depositTier2Cents)} is reserved for later. The ${formatMoney(tiers.launchAuctionLimitCents)} auction threshold applies to the bid before shipping.` : `Deposit tiers are ${formatMoney(tiers.depositTier1Cents)} and ${formatMoney(tiers.depositTier2Cents)}.`} Approved deposits count toward later bids at their actual amounts. Deposits are reviewed manually. Send the payment using your reference code, then submit the details. Access begins after an administrator confirms receipt. A payment screenshot alone does not grant access, and a confirmed deposit is not proof of identity.</p>
        {!policy.launchAccessEnabled ? <p>Hosted identity verification is an alternative for auction category access.</p> : <p>Identity verification is not required for launch. Buy It Now never requires a deposit. Auction bids over {formatMoney(tiers.launchAuctionLimitCents)} require the approved account deposit even if identity verification was previously completed.</p>}
        <p>Blocked accounts and unresolved non-payment restrictions apply at every level. If requirements change after an order is created, you can still complete payment for that order.</p>
        <Link className="button-primary inline-flex px-4 py-2 font-medium" href="/account/verification">View my verification</Link>
      </section>
    </div>
  );
}
