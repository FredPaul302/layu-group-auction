import Link from "next/link";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { socialAuthMessages } from "@/lib/auth/social-service";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  ...socialAuthMessages,
  invalid_credentials: "The email or password did not match an account.",
  invalid_email: "Enter a valid email address.",
  missing_fields: "Enter both your email and password.",
  too_many_attempts: "Too many attempts. Wait a bit before trying again."
};

const statusMessages: Record<string, string> = {
  signed_out: "You have been signed out.",
  password_reset: "Your password has been updated. Sign in with the new password."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorKey = readValue(params.error);
  const statusKey = readValue(params.status);
  const nextPath = readValue(params.next) ?? "";
  const errorMessage = errorKey && typeof errorMessages[errorKey] === "string" ? errorMessages[errorKey] : null;
  const statusMessage = statusKey && typeof statusMessages[statusKey] === "string" ? statusMessages[statusKey] : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Auth</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Log in</h2>
        <p className="text-sm text-zinc-600">
          Log in to manage your bids and purchases.
        </p>
      </section>

      {statusMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errorMessage}
        </p>
      ) : null}

      <div className="surface-card space-y-6 p-6">
        <form
          action="/api/auth/login"
          className="space-y-4"
          method="post"
        >
          <input name="next" type="hidden" value={nextPath} />

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
              autoComplete="current-password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              name="password"
              type="password"
            />
          </label>

          <button
            className="button-primary min-h-11 w-full justify-center px-4 py-2 text-sm font-medium"
            type="submit"
          >
            Log in
          </button>
        </form>
        <SocialSignIn intent="signin" nextPath={nextPath} />
      </div>

      <div className="space-y-2 text-sm text-zinc-600">
        <p>
          Need an account?{" "}
          <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/register">
            Register
          </Link>
        </p>
        <p>
          Forgot your password?{" "}
          <Link className="text-emerald-700 hover:text-emerald-800" href="/auth/forgot-password">
            Reset it
          </Link>
        </p>
      </div>
    </div>
  );
}
