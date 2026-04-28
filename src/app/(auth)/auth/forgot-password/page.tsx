import Link from "next/link";

type ForgotPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  too_many_attempts: "Too many reset requests. Wait a bit before trying again."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const status = readValue(params.status);
  const errorKey = readValue(params.error);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Forgot password</h2>
        <p className="text-sm text-zinc-600">
          Enter your email and, if an account exists, a reset link will be sent through the current
          development email adapter.
        </p>
      </section>

      {status === "sent" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          If an account exists for that email, a reset link has been sent.
        </p>
      ) : null}

      {errorKey && errorMessages[errorKey] ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errorMessages[errorKey]}
        </p>
      ) : null}

      <form
        action="/api/auth/forgot-password"
        className="space-y-4 rounded-md border border-zinc-200 p-6"
        method="post"
      >
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

        <button
          className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          type="submit"
        >
          Send reset link
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        Back to{" "}
        <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/login">
          log in
        </Link>
        .
      </p>
    </div>
  );
}
