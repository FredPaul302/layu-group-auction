import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";
import { describeVerificationPolicy } from "@/lib/verification/policy";
import { getVerificationPolicy, getHomepageVideoUrl } from "@/lib/verification/policy-service";
import { centsToDollars } from "@/lib/money";
import { getDepositTierSettings } from "@/lib/verification/tiers";

export const dynamic = "force-dynamic";

export default async function VerificationSettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminUser();
  const [policy, params, videoUrl] = await Promise.all([getVerificationPolicy(), searchParams, getHomepageVideoUrl()]);
  const error = typeof params.error === "string" ? params.error : null;
  const tiers = getDepositTierSettings(policy);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Deposit tiers & buyer protection" description={
        <p>Edit deposit amounts and auction access limits. Enter all amounts in dollars and cents, such as 20.00.</p>
      } />
      {params.status === "saved" ? <p className="notice notice-success">Verification settings saved. New bids, purchases, and offer acceptances now use this policy.</p> : null}
      {error ? <p className="notice notice-warning" role="alert">{error}</p> : null}
      <section className="surface-card space-y-5 p-6">
        <h3 className="text-lg font-semibold">Active: {policy.launchAccessEnabled ? "Launch access" : `Level ${policy.verificationLevel}`}</h3>
        <p className="text-sm text-zinc-700">{describeVerificationPolicy(policy)}</p>
        <form action="/api/admin/settings/verification" method="post" className="space-y-5">
          <fieldset className="surface-elevated space-y-4 rounded-xl border p-5">
            <legend className="px-2 text-lg font-semibold">Edit deposit tiers</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block space-y-2 text-sm font-medium">
                <span>First deposit tier ($)</span>
                <input type="number" inputMode="decimal" name="depositTier1" required min="0.01" max="1000000" step="0.01" defaultValue={centsToDollars(tiers.depositTier1Cents)} />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Second deposit tier ($)</span>
                <input type="number" inputMode="decimal" name="depositTier2" required min="0.02" max="1000000" step="0.01" defaultValue={centsToDollars(tiers.depositTier2Cents)} />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>No-deposit auction limit ($)</span>
                <input type="number" inputMode="decimal" name="launchAuctionLimit" required min="0" max="1000000" step="0.01" defaultValue={centsToDollars(tiers.launchAuctionLimitCents)} />
              </label>
            </div>
            <p className="text-sm text-zinc-700">During launch, bids at or below the auction limit need only a confirmed email. Higher bids require approved account deposits totaling at least the first tier. The second tier stays reserved for later.</p>
            <p className="text-sm text-zinc-700">Saved changes apply to new bids and offer acceptances. Existing approved deposits count at their actual amount toward the new tiers. Past payments, bids, and orders are preserved. Buy It Now stays deposit-free at every price.</p>
          </fieldset>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="launchAccessEnabled" defaultChecked={policy.launchAccessEnabled} className="mt-1" />
            <span>Launch access: use the auction limit and first deposit tier above. Keep the second tier and category requirements inactive, and show the launch announcement.</span>
          </label>
          <p className="text-sm text-zinc-600">Buy It Now always requires only a confirmed email, with no verification deposit at any price. Account restrictions still apply. The level and limit below apply to auctions and runner-up offers when launch access is off.</p>
          <label className="block space-y-2 text-sm font-medium">
            <span>Homepage announcement video (optional)</span>
            <input type="url" name="homepageVideoUrl" defaultValue={videoUrl ?? ""} maxLength={1000} placeholder="https://www.youtube.com/watch?v=..." className="w-full rounded-md border border-zinc-300 bg-white p-3" />
            <span className="block text-sm font-normal text-zinc-600">Use a YouTube link or an HTTPS link to an MP4/WebM video we host. Leave blank to show the text announcement on its own.</span>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Verification level</span>
            <select name="verificationLevel" defaultValue={policy.verificationLevel} className="w-full rounded-md border border-zinc-300 bg-white p-3">
              <option value="1">Level 1 — Email; secondary checks off for eligible items</option>
              <option value="2">Level 2 — Confirmed deposit with broader access below the limit</option>
              <option value="3">Level 3 — Existing deposit tiers or hosted identity verification</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Reduced-verification per-item limit (USD)</span>
            <input type="number" name="emailOnlyLimit" required min="1" max="1000000" step="0.01" defaultValue={(policy.emailOnlyLimitCents / 100).toFixed(2)} className="w-full rounded-md border border-zinc-300 bg-white p-3" />
          </label>
          <p className="text-sm text-zinc-600">Level 1 uses this limit for email-only buyers in categories that do not require full identity verification. Level 2 uses it to let any approved deposit cover those same categories. Above the limit, the usual category tier is required. The limit applies to the item price or bid, before shipping.</p>
          <button type="submit" className="button-primary px-4 py-2 text-sm font-medium">Save tiers and verification</button>
        </form>
      </section>
      <section className="surface-card space-y-3 p-6 text-sm text-zinc-700">
        <h3 className="text-lg font-semibold text-zinc-950">What stays protected</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>Verified email is always required. Phone verification is not connected yet.</li>
          <li>Blocked buyers and buyers with unresolved non-payment flags cannot start new purchases, bid, or accept offers at any level.</li>
          <li>Category requirements apply to auctions only when launch access is off. Buy It Now remains deposit-free.</li>
          <li>Only a deposit you have approved counts. A screenshot or pending submission grants no access; a confirmed deposit is not proof of identity.</li>
          <li>Changes apply to new actions, including fixed-price checkout. Existing bids and orders keep their commitments, and buyers can still pay existing orders.</li>
        </ul>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link className="font-medium text-emerald-700" href="/admin/bidders">Manage and block buyers</Link>
          <Link className="font-medium text-emerald-700" href="/admin/deposits">Review deposits</Link>
          <Link className="font-medium text-emerald-700" href="/admin/categories">Manage category requirements</Link>
        </div>
      </section>
    </div>
  );
}
