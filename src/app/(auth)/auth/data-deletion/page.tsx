import Link from "next/link";

import { getSocialDataSupportEmail } from "@/lib/auth/social-support";

export const dynamic = "force-dynamic";

export default async function DataDeletionPage() {
  const supportEmail = await getSocialDataSupportEmail();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold">Account and sign-in data deletion</h2>
        <p>These instructions cover information stored by Layu Market when you sign in with Google or Facebook, including your connected provider identifier, name, and email.</p>
      </section>
      <section className="surface-card space-y-4 p-6">
        <h3 className="text-xl font-semibold">Remove a Google or Facebook connection</h3>
        <ol className="list-decimal space-y-3 pl-6">
          <li>Sign in to Layu Market and open <Link className="text-emerald-700 underline" href="/account/connections">Account → Sign-in methods</Link>.</li>
          <li>Open Disconnect under Google or Facebook, confirm the checkbox, and choose Disconnect.</li>
          <li>The saved provider connection and provider identifier are deleted. Keep another working sign-in method first. If this is your only method or you cannot sign in, use the support contact below to request removal.</li>
        </ol>
        <p className="text-sm text-zinc-600">Disconnecting does not close your Layu account or remove its email, name, bids, deposits, orders, or payment records. You can also remove Layu from the connected apps in your Google or Facebook account settings. Removing access there does not send a full Layu account deletion request.</p>
      </section>
      <section className="surface-card space-y-4 p-6">
        <h3 className="text-xl font-semibold">Request account or personal data deletion</h3>
        {supportEmail ? (
          <p>Email <a className="text-emerald-700 underline" href={`mailto:${encodeURIComponent(supportEmail)}?subject=Layu%20Market%20data%20deletion%20request`}>{supportEmail}</a> with the subject “Layu Market data deletion request.” Include your Layu account email and whether you want to remove a Google/Facebook connection, specific personal information, or your account.</p>
        ) : (
          <p>The site&apos;s support email is not currently configured. The owner needs to configure the support contact before email deletion requests can be accepted here. You can still remove an eligible provider connection using the steps above.</p>
        )}
        <p>Do not send passwords, access tokens, identity documents, or payment credentials. Support will confirm ownership before processing a request and reply with its outcome or any records that need to be retained.</p>
        <p className="text-sm text-zinc-600">Some auction, transaction, accounting, security, and legally required records may need to be retained as described in the <Link className="text-emerald-700 underline" href="/privacy">privacy policy</Link>. We do not store Google or Facebook passwords or long-lived sign-in access tokens.</p>
      </section>
    </div>
  );
}
