import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SocialSignIn } from "@/components/auth/social-sign-in";
import { getCurrentUser } from "@/lib/auth";
import { getSocialProviderConfig } from "@/lib/auth/social-config";
import { socialAuthMessages } from "@/lib/auth/social-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Facebook sign-in review", robots: { index: false, follow: false } };

export default async function FacebookReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!getSocialProviderConfig("facebook")?.reviewOnly) notFound();
  const params = await searchParams;
  const user = await getCurrentUser();
  const connected = user ? Boolean(await prisma.socialAccount.findFirst({ where: { userId: user.id, provider: "facebook" }, select: { id: true } })) : false;
  const error = typeof params.error === "string" && typeof socialAuthMessages[params.error] === "string" ? socialAuthMessages[params.error] : null;
  const intent = params.mode === "register" ? "register" : "signin";

  return <div className="mx-auto max-w-xl space-y-6">
    <section className="space-y-3">
      <h2 className="text-3xl font-semibold">Facebook sign-in review</h2>
      <p className="text-sm text-zinc-600">Use this page to test Facebook sign-in while Layu completes Meta review. Your Facebook account must have access to this app through Meta. Facebook is still hidden on the regular login and registration pages.</p>
    </section>
    {error ? <p role="alert" className="rounded-md border border-rose-300 p-4">{error}</p> : null}
    {user ? <section className="surface-card space-y-4 p-6">
      <p role="status">You are signed in to your Layu account.</p>
      {connected ? <>
        <p role="status">Facebook is connected to this account.</p>
        <p className="text-sm">To test signing back in, sign out below, then reopen this page and choose Facebook.</p>
      </> : user.emailVerifiedAtUtc ? <>
        <p>Connect Facebook to this existing Layu account. Your bids, purchases, and account access stay with this account.</p>
        <form action="/api/auth/social/facebook/start" method="post">
          <input type="hidden" name="intent" value="link" />
          <button type="submit" className="button-primary px-4 py-2">Connect Facebook</button>
        </form>
      </> : <p><Link className="underline" href="/auth/verify-email">Confirm your email</Link> before connecting Facebook.</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Link className="text-sm underline" href="/account/connections">Manage sign-in methods</Link>
        <form action="/api/auth/logout" method="post"><button className="button-secondary px-4 py-2" type="submit">Sign out</button></form>
      </div>
    </section> : <section className="surface-card space-y-4 p-6">
      <h3 className="text-xl font-semibold">{intent === "register" ? "Create a Layu account" : "Sign in with Facebook"}</h3>
      <p className="text-sm">Already have a Layu account? <Link className="underline" href="/auth/login?next=%2Fauth%2Ffacebook-review">Sign in with your existing method</Link> first, then connect Facebook here.</p>
      <SocialSignIn intent={intent} nextPath="/auth/facebook-review" facebookReview />
      <p className="text-sm"><Link className="underline" href={intent === "register" ? "/auth/facebook-review" : "/auth/facebook-review?mode=register"}>{intent === "register" ? "Sign in to a connected account" : "Register a new account with Facebook"}</Link></p>
      {intent === "register" ? <p className="text-sm">Confirm your email with Layu before buying or bidding. Registration and sign-in do not require a payment.</p> : null}
    </section>}
    <p className="text-sm"><Link className="underline" href="/auth/data-deletion">Account and provider data deletion instructions</Link></p>
  </div>;
}
