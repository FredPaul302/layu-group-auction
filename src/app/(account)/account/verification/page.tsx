import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { getUserVerificationOverview } from "@/lib/verification/service";

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
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Verification status</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Email verification is complete. Choose or review your secondary verification path here.
        </p>
      </section>

      {notice === "secondary_required" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Commerce actions stay locked until secondary verification exists.
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Current gating</h3>
          <ul className="space-y-3 text-sm text-zinc-700">
            <li>Email verified: Yes</li>
            <li>
              Secondary verification source: {verificationOverview.derivedEligibility.source}
            </li>
            <li>Max bidding tier: {verificationOverview.derivedEligibility.maxBidTier}</li>
            <li>Verification eligible: {verificationOverview.derivedEligibility.isVerificationEligible ? "Yes" : "No"}</li>
            <li>Commerce access: Still locked until bidding and claims are explicitly enabled.</li>
          </ul>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Verification paths</h3>
          <div className="space-y-4 text-sm text-zinc-700">
            <div className="rounded-md border border-zinc-200 p-4">
              <p className="font-medium text-zinc-900">Persona identity verification</p>
              <p className="mt-2">
                Use the hosted Persona flow. Only inquiry IDs, statuses, timestamps, and minimal
                metadata are stored locally.
              </p>
              <Link
                className="mt-3 inline-flex text-emerald-700 hover:text-emerald-800"
                href="/account/verification/persona"
              >
                Open Persona verification
              </Link>
            </div>

            <div className="rounded-md border border-zinc-200 p-4">
              <p className="font-medium text-zinc-900">Manual deposit verification</p>
              <p className="mt-2">
                Choose a tier, receive a unique reference code, submit payment details, and wait
                for manual admin review.
              </p>
              <Link
                className="mt-3 inline-flex text-emerald-700 hover:text-emerald-800"
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
