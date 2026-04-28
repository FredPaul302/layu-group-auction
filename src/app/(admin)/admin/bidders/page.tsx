import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminBidderVerificationRows } from "@/lib/verification/service";

export default async function AdminBiddersPage() {
  const bidders = await getAdminBidderVerificationRows();

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Review email verification, Persona status, deposit-backed tiers, and blocking flags in
            one place.
          </p>
        }
        eyebrow="Admin"
        meta={
          <div className="metric-card">
            <span className="meta-label">Bidder records</span>
            <span className="meta-value tabular-data">{bidders.length}</span>
          </div>
        }
        title="Bidders"
      />

      <div className="space-y-4">
        {bidders.length === 0 ? (
          <EmptyState description="No bidder accounts yet." title="No bidders yet" />
        ) : (
          bidders.map((bidder) => (
            <article key={bidder.id} className="surface-card fade-in p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-2 text-sm text-zinc-700">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      label={bidder.emailVerifiedAtUtc ? "Email verified" : "Email pending"}
                      status={bidder.emailVerifiedAtUtc ? "approved" : "pending_review"}
                    />
                    <StatusBadge
                      label={bidder.latestPersonaVerification?.status ?? "Persona none"}
                      status={bidder.latestPersonaVerification?.status ?? "draft"}
                    />
                    <StatusBadge status={bidder.derivedEligibility.maxBidTier} />
                    {bidder.bidderProfile?.isBlocked ? <StatusBadge status="blocked" /> : null}
                  </div>
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
                    className="button-secondary px-4 py-2 text-sm font-medium"
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
