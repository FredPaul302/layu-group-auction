import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { getUserVerificationOverview } from "@/lib/verification/service";

type PersonaVerificationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  already_approved: "Persona is already approved for this account.",
  not_configured: "Persona is not configured yet. Add a template ID to start the hosted flow.",
  pending: "Persona verification is in progress or awaiting review.",
  rejected: "Persona verification did not result in approval.",
  expired: "The Persona inquiry expired before approval.",
  returned: "Persona redirected back to the site. Final approval still comes from webhook results."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PersonaVerificationPage({
  searchParams
}: PersonaVerificationPageProps) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();

  if (!hasVerifiedEmail(user)) {
    redirect("/auth/verify-email?status=required");
  }

  const verificationOverview = await getUserVerificationOverview(user.id);
  const status = readValue(params.status);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Persona verification</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          This hosted flow stores only minimal metadata locally. Raw Persona ID images are never
          stored in the application database.
        </p>
      </section>

      {status && statusMessages[status] ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessages[status]}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Current Persona status</h3>
          {verificationOverview.latestPersonaVerification ? (
            <dl className="space-y-3 text-sm text-zinc-700">
              <div>
                <dt className="font-medium text-zinc-900">Status</dt>
                <dd>{verificationOverview.latestPersonaVerification.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Inquiry ID</dt>
                <dd>{verificationOverview.latestPersonaVerification.inquiryId ?? "Not assigned yet"}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Reference ID</dt>
                <dd>{verificationOverview.latestPersonaVerification.referenceId ?? "Not assigned yet"}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Submitted</dt>
                <dd>{verificationOverview.latestPersonaVerification.submittedAtUtc.toISOString()}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Decision timestamp</dt>
                <dd>
                  {verificationOverview.latestPersonaVerification.decidedAtUtc?.toISOString() ??
                    "Pending"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-600">
              No Persona verification has been started for this account yet.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Start hosted flow</h3>
          <p className="text-sm text-zinc-700">
            Approval moves your bidder profile to the full tier. Rejection or expiry keeps you
            ineligible unless deposit review grants a tier separately.
          </p>
          <form action="/api/verifications/persona/start" method="post">
            <button
              className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              disabled={!verificationOverview.isPersonaFlowConfigured}
              type="submit"
            >
              Start Persona verification
            </button>
          </form>
          {!verificationOverview.isPersonaFlowConfigured ? (
            <p className="text-sm text-zinc-600">
              Add `PERSONA_TEMPLATE_ID` to enable the hosted flow redirect.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
