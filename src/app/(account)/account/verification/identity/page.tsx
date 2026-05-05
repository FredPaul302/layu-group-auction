import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatUtcDateTime } from "@/lib/catalog/presentation";
import { hasVerifiedEmail } from "@/lib/permissions";
import { getUserVerificationOverview } from "@/lib/verification/service";

type IdentityVerificationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  already_approved: "Identity verification is already approved for this account.",
  already_pending: "An identity verification session is already in progress for this account.",
  not_configured: "Identity verification is not configured yet.",
  pending: "Identity verification is in progress or awaiting review.",
  rejected: "Identity verification did not result in approval.",
  expired: "The identity verification session expired before approval.",
  returned: "The hosted flow redirected back to the site. Final approval still comes from signed webhook results."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getProviderLabel(provider: string) {
  switch (provider) {
    case "didit":
      return "Didit-powered";
    case "persona":
      return "Persona";
    default:
      return "Not configured";
  }
}

function getStartAction(provider: string) {
  return provider === "persona"
    ? "/api/verifications/persona/start"
    : "/api/verifications/didit/start";
}

export default async function IdentityVerificationPage({
  searchParams
}: IdentityVerificationPageProps) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();

  if (!hasVerifiedEmail(user)) {
    redirect("/auth/verify-email?status=required");
  }

  const verificationOverview = await getUserVerificationOverview(user.id);
  const status = readValue(params.status);
  const providerLabel = getProviderLabel(verificationOverview.identityVerificationProvider);
  const latestVerification = verificationOverview.latestPersonaVerification;

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Complete hosted identity verification for full bidding eligibility. Raw identity
            document images are not stored in the application database. Review the{" "}
            <Link className="text-emerald-700 hover:text-emerald-800" href="/privacy">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link className="text-emerald-700 hover:text-emerald-800" href="/terms">
              terms
            </Link>{" "}
            before starting.
          </p>
        }
        eyebrow="Account"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Identity status</span>
              <div className="pt-1">
                <StatusBadge status={latestVerification?.status ?? "draft"} />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Hosted flow</span>
              <div className="pt-1">
                <StatusBadge
                  label={
                    verificationOverview.isIdentityVerificationFlowConfigured
                      ? `${providerLabel} configured`
                      : "Not configured"
                  }
                  status={
                    verificationOverview.isIdentityVerificationFlowConfigured
                      ? "approved"
                      : "pending_review"
                  }
                />
              </div>
            </div>
          </>
        }
        title="Identity verification"
      />

      {status && statusMessages[status] ? (
        <p className="notice notice-success">{statusMessages[status]}</p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Current identity status</h3>
          {latestVerification ? (
            <dl className="data-list text-sm text-zinc-700">
              <div className="data-row">
                <dt className="font-medium text-zinc-900">Status</dt>
                <dd>{latestVerification.status}</dd>
              </div>
              <div className="data-row">
                <dt className="font-medium text-zinc-900">Session ID</dt>
                <dd>{latestVerification.inquiryId ?? "Not assigned yet"}</dd>
              </div>
              <div className="data-row">
                <dt className="font-medium text-zinc-900">Reference ID</dt>
                <dd>{latestVerification.referenceId ?? "Not assigned yet"}</dd>
              </div>
              <div className="data-row">
                <dt className="font-medium text-zinc-900">Submitted</dt>
                <dd>{formatUtcDateTime(latestVerification.submittedAtUtc)}</dd>
              </div>
              <div className="data-row">
                <dt className="font-medium text-zinc-900">Decision timestamp</dt>
                <dd>
                  {latestVerification.decidedAtUtc
                    ? formatUtcDateTime(latestVerification.decidedAtUtc)
                    : "Pending"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-600">
              No hosted identity verification has been started for this account yet.
            </p>
          )}
        </div>

        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Start hosted flow</h3>
          <p className="text-sm text-zinc-700">
            Approval moves your bidder profile to the full tier. Rejection or expiry keeps you
            ineligible unless deposit review grants a tier separately.
          </p>
          <form action={getStartAction(verificationOverview.identityVerificationProvider)} method="post">
            <button
              className="button-primary px-4 py-2 text-sm font-medium"
              disabled={!verificationOverview.isIdentityVerificationFlowConfigured}
              type="submit"
            >
              Start identity verification
            </button>
          </form>
          {!verificationOverview.isIdentityVerificationFlowConfigured ? (
            <p className="text-sm text-zinc-600">
              Configure `IDENTITY_VERIFICATION_PROVIDER` and the selected provider keys to enable
              hosted identity verification.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
