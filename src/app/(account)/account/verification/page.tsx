import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatBidTierLabel } from "@/lib/catalog/presentation";
import { hasVerifiedEmail } from "@/lib/permissions";
import { getUserVerificationOverview } from "@/lib/verification/service";
import { describeVerificationPolicy } from "@/lib/verification/policy";

type VerificationChoicePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VerificationChoicePage({
  searchParams
}: VerificationChoicePageProps) {
  const params = await searchParams;
  const notice = readValue(params.notice);
  const user = await requireAuthenticatedUser();
  const emailIsVerified = hasVerifiedEmail(user);

  if (!emailIsVerified) {
    redirect("/auth/verify-email?status=required");
  }

  const verificationOverview = await getUserVerificationOverview(user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>{describeVerificationPolicy(verificationOverview.policy)}</p>
        }
        eyebrow="Account"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Email</span>
              <div className="pt-1">
                <StatusBadge label="Verified email" status="approved" />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Source</span>
              <div className="pt-1">
                <StatusBadge
                  label={
                    verificationOverview.derivedEligibility.source === "persona"
                      ? "Identity verified"
                      : verificationOverview.derivedEligibility.source === "deposit"
                        ? "Deposit verified"
                        : verificationOverview.derivedEligibility.source === "email"
                          ? "Email confirmed"
                          : "Verification needed"
                  }
                  status={
                    verificationOverview.derivedEligibility.source === "persona"
                      ? "persona_verified"
                      : verificationOverview.derivedEligibility.source === "deposit"
                        ? "deposit_verified"
                        : verificationOverview.derivedEligibility.source === "email" ? "approved" : "pending_review"
                  }
                />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Approved tier</span>
              <div className="pt-1">
                <StatusBadge
                  label={formatBidTierLabel(verificationOverview.derivedEligibility.maxBidTier, verificationOverview.policy)}
                  status={verificationOverview.derivedEligibility.maxBidTier}
                />
              </div>
            </div>
          </>
        }
        title="Verification status"
      />

      {notice === "secondary_required" ? (
        <p className="notice notice-warning">
          This item needs additional verification under the current policy.
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Current access: {verificationOverview.policy.launchAccessEnabled ? "Launch access" : `Level ${verificationOverview.policy.verificationLevel}`}</h3>
          <ul className="data-list text-sm text-zinc-700">
            <li className="data-row">
              <span>Email verified</span>
              <span className="meta-value">Yes</span>
            </li>
            <li className="data-row">
              <span>Secondary verification source</span>
              <span className="meta-value">{verificationOverview.derivedEligibility.source}</span>
            </li>
            <li className="data-row">
              <span>Max bidding tier</span>
              <span className="meta-value">{formatBidTierLabel(verificationOverview.derivedEligibility.maxBidTier, verificationOverview.policy)}</span>
            </li>
            <li className="data-row">
              <span>Verification eligible</span>
              <span className="meta-value">
                {verificationOverview.derivedEligibility.isVerificationEligible ? "Yes" : "No"}
              </span>
            </li>
            <li className="data-row">
              <span>Commerce access</span>
              <span className="meta-value">{verificationOverview.derivedEligibility.isVerificationEligible ? "Buy It Now is available without a deposit. Check auction requirements before bidding." : "Additional verification or an account review is needed."}</span>
            </li>
          </ul>
        </div>

        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Verification paths</h3>
          <div className="space-y-4 text-sm text-zinc-700">
            {!verificationOverview.policy.launchAccessEnabled ? <div className="surface-elevated space-y-3 p-4">
              <p className="font-medium text-zinc-900">Hosted identity verification</p>
              <p className="mt-2">
                Use the active hosted provider. Only session IDs, statuses, timestamps, and
                minimal metadata are stored locally.
              </p>
              <Link
                className="button-secondary mt-1 px-4 py-2 text-sm font-medium"
                href="/account/verification/identity"
              >
                Open identity verification
              </Link>
            </div> : null}

            <div className="surface-elevated space-y-3 p-4">
              <p className="font-medium text-zinc-900">Manual deposit verification</p>
              <p className="mt-2">
                Choose a tier, receive a unique reference code, submit payment details, and wait
                for manual admin review. Access starts only after the actual payment is confirmed;
                a deposit does not prove your identity.
              </p>
              <Link
                className="button-secondary mt-1 px-4 py-2 text-sm font-medium"
                href="/account/verification/deposit"
              >
                Open deposit verification
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
