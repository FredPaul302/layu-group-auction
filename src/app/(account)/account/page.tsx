import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import { canParticipateInCommerce, hasVerifiedEmail } from "@/lib/permissions";

export default async function AccountDashboardPage() {
  const user = await requireAuthenticatedUser();
  const emailIsVerified = hasVerifiedEmail(user);
  const commerceEnabled = canParticipateInCommerce(user);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Account dashboard</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          This is the current account home for login state, email verification, and the placeholder
          verification path handoff.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Account status</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div>
              <dt className="font-medium text-zinc-900">Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Role</dt>
              <dd>{user.role}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Email verification</dt>
              <dd>{emailIsVerified ? "Verified" : "Pending"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Accepted terms version</dt>
              <dd>{user.acceptedTermsVersion ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Commerce eligibility</dt>
              <dd>{commerceEnabled ? "Enabled" : "Locked until secondary verification exists"}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
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
              <Link className="text-emerald-700 hover:text-emerald-800" href="/account/purchases">
                Purchases placeholder
              </Link>
            </li>
          </ul>

          <form action="/api/auth/logout" method="post">
            <button
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-400 hover:text-zinc-950"
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
