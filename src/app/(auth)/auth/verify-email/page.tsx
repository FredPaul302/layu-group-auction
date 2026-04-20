import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";

type VerifyEmailPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  check_inbox: "Check the development email output for your verification link.",
  expired: "That verification link expired. Request a fresh one below.",
  invalid: "That verification link is invalid or has already been used.",
  required: "Verify your email before any bidding or fixed-price claim flow can continue.",
  resent: "A new verification link has been sent to the development email adapter.",
  success: "Your email has been verified."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const statusKey = readValue(params.status);
  const user = await getCurrentUser();
  const emailIsVerified = hasVerifiedEmail(user);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Verify email</h2>
        <p className="text-sm text-zinc-600">
          Email verification is the first gate for any buyer or bidder. Secondary verification comes
          after this step.
        </p>
      </section>

      {statusKey && statusMessages[statusKey] ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessages[statusKey]}
        </p>
      ) : null}

      {user ? (
        <section className="space-y-4 rounded-md border border-zinc-200 p-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-zinc-950">Current account</h3>
            <p className="text-sm text-zinc-600">{user.email}</p>
          </div>

          {emailIsVerified ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-700">
                Your email is verified. You can continue to the verification-choice placeholder,
                though secondary verification is still not implemented in this step.
              </p>
              <Link
                className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                href="/account/verification"
              >
                Go to verification status
              </Link>
            </div>
          ) : (
            <form action="/api/auth/verify-email" className="space-y-4" method="post">
              <p className="text-sm text-zinc-700">
                Resend the verification link using the development email adapter.
              </p>
              <button
                className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                type="submit"
              >
                Resend verification email
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="rounded-md border border-zinc-200 p-6 text-sm text-zinc-700">
          If you opened a link from email, the verification result will appear here. You can also{" "}
          <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/login">
            log in
          </Link>{" "}
          to request another verification email.
        </section>
      )}
    </div>
  );
}
