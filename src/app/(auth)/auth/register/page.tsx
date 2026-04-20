import Link from "next/link";

type RegisterPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  duplicate_email: "An account with that email already exists.",
  invalid_email: "Enter a valid email address.",
  invalid_password: "Passwords must be at least 8 characters long.",
  missing_fields: "Complete the required registration fields.",
  password_mismatch: "Password confirmation did not match.",
  terms_required: "You must accept the terms to create an account."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const errorKey = readValue(params.error);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Register</h2>
        <p className="text-sm text-zinc-600">
          Create an account to track bids, offers, and purchases. New accounts start with email
          unverified and no bidding eligibility until later verification steps are completed.
        </p>
      </section>

      {errorKey && errorMessages[errorKey] ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errorMessages[errorKey]}
        </p>
      ) : null}

      <form
        action="/api/auth/register"
        className="space-y-4 rounded-md border border-zinc-200 p-6"
        method="post"
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Display name</span>
          <input
            autoComplete="name"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            name="displayName"
            type="text"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Email</span>
          <input
            required
            autoComplete="email"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            name="email"
            type="email"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-900">Password</span>
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

        <label className="flex gap-3 rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
          <input className="mt-0.5" name="termsAccepted" type="checkbox" value="yes" />
          <span>I accept the current auction site terms for account registration.</span>
        </label>

        <button
          className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          type="submit"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        Already registered?{" "}
        <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
