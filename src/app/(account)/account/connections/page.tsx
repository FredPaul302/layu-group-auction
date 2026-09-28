import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getEnabledSocialProviders, socialProviderLabel, socialProviders } from "@/lib/auth/social-config";
import { socialAuthMessages } from "@/lib/auth/social-service";
import { prisma } from "@/lib/prisma";

export default async function SignInMethodsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser();
  const params = await searchParams;
  const error = typeof params.error === "string" && typeof socialAuthMessages[params.error] === "string" ? socialAuthMessages[params.error] : null;
  const accounts = await prisma.socialAccount.findMany({ where: { userId: user.id }, select: { provider: true } });
  const enabled = getEnabledSocialProviders();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-3xl font-semibold">Sign-in methods</h2>
        <p className="text-sm text-zinc-600">Connect Google or Facebook to sign in to this Layu account. This does not connect your selling channels or publish anything.</p>
      </section>
      {params.status === "connected" ? <p role="status" className="surface-elevated rounded-md p-4">Your sign-in method is connected.</p> : null}
      {params.status === "disconnected" ? <p role="status" className="surface-elevated rounded-md p-4">The sign-in connection and its provider identifier have been removed from this account.</p> : null}
      {error ? <p role="alert" className="rounded-md border border-rose-300 p-4">{error}</p> : null}
      {!user.emailVerifiedAtUtc ? <p><Link className="text-emerald-700 underline" href="/auth/verify-email">Verify your email</Link> before connecting another sign-in method.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {socialProviders.map((provider) => {
          const linked = accounts.some((account) => account.provider === provider);
          return (
            <section key={provider} className="surface-card space-y-3 p-6">
              <h3 className="text-xl font-semibold">{socialProviderLabel(provider)}</h3>
              <p className="text-sm">{linked ? "Connected to this account." : enabled.includes(provider) ? "Ready to connect." : "The site owner is setting up this sign-in option."}</p>
              {!linked && enabled.includes(provider) && user.emailVerifiedAtUtc ? (
                <form action={`/api/auth/social/${provider}/start`} method="post">
                  <input type="hidden" name="intent" value="link" />
                  <button type="submit" className="button-primary px-4 py-2 text-sm">Connect {socialProviderLabel(provider)}</button>
                </form>
              ) : null}
              {linked ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Disconnect {socialProviderLabel(provider)}</summary>
                  <form action={`/api/auth/social/${provider}/disconnect`} method="post" className="mt-3 space-y-3">
                    <p>This removes the saved connection. Keep a password or another available sign-in method so you can get back into your account.</p>
                    <label className="flex gap-2"><input required type="checkbox" name="confirmDisconnect" value="yes" /><span>Disconnect {socialProviderLabel(provider)} from my Layu account.</span></label>
                    <button type="submit" className="button-secondary px-4 py-2">Disconnect {socialProviderLabel(provider)}</button>
                  </form>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="text-sm text-zinc-600">Your email, bids, deposits, and purchases remain on this account. Your Google or Facebook password is never shared with Layu.</p>
      <p className="text-sm"><Link className="text-emerald-700 underline" href="/auth/data-deletion">Account and provider data deletion instructions</Link></p>
    </div>
  );
}
