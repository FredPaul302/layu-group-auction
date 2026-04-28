import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { formatBidTierLabel } from "@/lib/catalog/presentation";
import { getUserVerificationOverview } from "@/lib/verification/service";

export default async function AccountDashboardPage() {
  const user = await requireAuthenticatedUser();
  const emailIsVerified = hasVerifiedEmail(user);
  const verificationOverview = await getUserVerificationOverview(user.id);
  const biddingEnabled =
    emailIsVerified && verificationOverview.derivedEligibility.isVerificationEligible;

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            This is the current account home for login state, email verification, and the
            verification path handoff.
          </p>
        }
        eyebrow="Account"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Email status</span>
              <div className="pt-1">
                <StatusBadge
                  label={emailIsVerified ? "Email verified" : "Email pending"}
                  status={emailIsVerified ? "approved" : "pending_review"}
                />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Max tier</span>
              <div className="pt-1">
                <StatusBadge
                  label={formatBidTierLabel(verificationOverview.derivedEligibility.maxBidTier)}
                  status={verificationOverview.derivedEligibility.maxBidTier}
                />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Commerce access</span>
              <div className="pt-1">
                <StatusBadge
                  label={biddingEnabled ? "Verification ready" : "Locked"}
                  status={biddingEnabled ? "approved" : "blocked"}
                />
              </div>
            </div>
          </>
        }
        title="Account dashboard"
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Account status</h3>
          <dl className="data-list text-sm text-zinc-700">
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Role</dt>
              <dd>{user.role}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Email verification</dt>
              <dd>{emailIsVerified ? "Verified" : "Pending"}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Accepted terms version</dt>
              <dd>{user.acceptedTermsVersion ?? "Not recorded"}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Auction bidding</dt>
              <dd>{biddingEnabled ? "Enabled" : "Locked"}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Max bid tier</dt>
              <dd>{verificationOverview.derivedEligibility.maxBidTier}</dd>
            </div>
            <div className="data-row">
              <dt className="font-medium text-zinc-900">Fixed-price purchase</dt>
              <dd>{biddingEnabled ? "Enabled" : "Locked"}</dd>
            </div>
          </dl>
        </div>

        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Next steps</h3>
          <ul className="space-y-2 text-sm text-zinc-700">
            <li>
              <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/verify-email">
                Verify email
              </Link>
            </li>
            <li>
              <Link className="text-emerald-700 hover:text-emerald-800" href="/account/verification">
                Verification status
              </Link>
            </li>
            <li>
              <Link className="text-emerald-700 hover:text-emerald-800" href="/account/bids">
                My bids
              </Link>
            </li>
            <li>
              <Link className="text-emerald-700 hover:text-emerald-800" href="/account/purchases">
                Purchases and wins
              </Link>
            </li>
            <li>
              <Link className="text-emerald-700 hover:text-emerald-800" href="/account/offers">
                Runner-up offers
              </Link>
            </li>
          </ul>

          <form action="/api/auth/logout" method="post">
            <button
              className="button-secondary px-4 py-2 text-sm font-medium"
              type="submit"
            >
              Log out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
