import Link from "next/link";

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  invalid: "This reset link is invalid or has already been used.",
  expired: "This reset link has expired.",
  invalid_password: "Passwords must be at least 8 characters long.",
  missing_fields: "Enter and confirm your new password.",
  password_mismatch: "Password confirmation did not match.",
  too_many_attempts: "Too many reset attempts. Wait a bit before trying again."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = readValue(params.token) ?? "";
  const errorKey = readValue(params.error);

  if (!token) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
          <h2 className="text-3xl font-semibold text-zinc-950">Reset password</h2>
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            A reset token is required before a new password can be set.
          </p>
        </section>

        <p className="text-sm text-zinc-600">
          Request a fresh link from{" "}
          <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/forgot-password">
            forgot password
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Reset password</h2>
        <p className="text-sm text-zinc-600">
          Choose a new password for this account. Existing sessions will be cleared after the reset.
        </p>
      </section>

      {errorKey && errorMessages[errorKey] ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errorMessages[errorKey]}
        </p>
      ) : null}

      <form
        action="/api/auth/reset-password"
        className="space-y-4 rounded-md border border-zinc-200 p-6"
        method="post"
      >
        <input name="token" type="hidden" value={token} />

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">New password</span>
          <input
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            name="password"
            type="password"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Confirm password</span>
          <input
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            name="confirmPassword"
            type="password"
          />
        </label>

        <button
          className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          type="submit"
        >
          Update password
        </button>
      </form>
    </div>
  );
}
