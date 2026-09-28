import Image from "next/image";
import Link from "next/link";

import { getEnabledSocialProviders, getSocialProviderConfig, socialProviderLabel, type SocialProvider } from "@/lib/auth/social-config";

export function SocialSignIn({ intent, nextPath = "", facebookReview = false }: { intent: "signin" | "register"; nextPath?: string; facebookReview?: boolean }) {
  const providers: SocialProvider[] = facebookReview
    ? getSocialProviderConfig("facebook")?.reviewOnly ? ["facebook"] : []
    : getEnabledSocialProviders();
  if (!providers.length) return null;
  return (
    <form method="post" aria-label={intent === "register" ? "Social registration" : "Other sign-in options"} className={intent === "register" ? "surface-card space-y-4 p-6" : "space-y-4"}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="next" value={nextPath} />
      {intent === "register" ? (
        <h3 className="text-lg font-semibold">Register with your account</h3>
      ) : facebookReview ? null : (
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--color-border)]" />
          <span>Or sign in with</span>
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
      )}
      {intent === "register" ? (
        <label className="flex gap-3 text-sm">
          <input required className="mt-1" type="checkbox" name="termsAccepted" value="yes" />
          <span>I accept the <Link className="text-emerald-700 underline" href="/terms">terms</Link> and acknowledge the <Link className="text-emerald-700 underline" href="/privacy">privacy policy</Link>.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        {providers.map((provider) => (
          <button
            key={provider}
            type="submit"
            formAction={`/api/auth/social/${provider}/start`}
            aria-label={`${intent === "register" ? "Continue with" : "Sign in with"} ${socialProviderLabel(provider)}`}
            title={`${intent === "register" ? "Continue with" : "Sign in with"} ${socialProviderLabel(provider)}`}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)] ${provider === "google" ? "transition-shadow hover:shadow-md" : "border border-[#747775] bg-white transition-colors hover:bg-zinc-50"}`}
          >
            {provider === "google" ? (
              <Image src="/images/auth/google-sign-in.svg" alt="" width={44} height={44} />
            ) : (
              <Image src="/images/auth/facebook-logo.png" alt="" width={24} height={24} />
            )}
          </button>
        ))}
      </div>
      {intent === "register" && !facebookReview ? <p className="text-sm text-zinc-600">Already have a Layu account? Sign in with your current method first, then connect another method in your account.</p> : null}
    </form>
  );
}
