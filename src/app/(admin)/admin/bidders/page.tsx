import Link from "next/link";

import { getAdminBidderVerificationRows } from "@/lib/verification/service";

export default async function AdminBiddersPage() {
  const bidders = await getAdminBidderVerificationRows();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Bidders</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Review email verification, Persona status, deposit-backed tiers, and blocking flags in one place.
        </p>
      </section>

      <div className="space-y-4">
        {bidders.length === 0 ? (
          <p className="rounded-md border border-zinc-200 p-6 text-sm text-zinc-600">
            No bidder accounts yet.
          </p>
        ) : (
          bidders.map((bidder) => (
            <article key={bidder.id} className="rounded-md border border-zinc-200 p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-2 text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">{bidder.email}</p>
                  <p>Email verified: {bidder.emailVerifiedAtUtc ? "Yes" : "No"}</p>
                  <p>Persona status: {bidder.latestPersonaVerification?.status ?? "none"}</p>
                  <p>Active approved deposit hold: ${(bidder.activeApprovedDepositAmountCents / 100).toFixed(2)}</p>
                  <p>Derived verification source: {bidder.derivedEligibility.source}</p>
                  <p>Derived max tier: {bidder.derivedEligibility.maxBidTier}</p>
                  <p>Blocked: {bidder.bidderProfile?.isBlocked ? "Yes" : "No"}</p>
                  <p>Non-paying flags: {bidder.bidderProfile?.nonPaymentStrikeCount ?? 0}</p>
                </div>

                <div className="flex items-start justify-start lg:justify-end">
                  <Link
                    className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400"
                    href={`/admin/users/${bidder.id}`}
                  >
                    Open bidder detail
                  </Link>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
