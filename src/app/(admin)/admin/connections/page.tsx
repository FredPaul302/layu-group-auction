import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getEnabledSocialProviders, getSocialProviderConfig, socialProviders, socialProviderLabel } from "@/lib/auth/social-config";
import { getAppEnv } from "@/lib/config/app-env";
import { crossListingChannels } from "@/lib/cross-listing/channels";
import { getDirectConnectionStatus } from "@/lib/cross-listing/connectors";

export default function AdminConnectionsPage() {
  const enabled = getEnabledSocialProviders();
  const facebookReview = getSocialProviderConfig("facebook")?.reviewOnly === true;
  const siteUrl = getAppEnv().app.url;
  return <div className="space-y-8">
    <PageHeader eyebrow="Admin" title="Accounts & connections" description={<p>Set these up one at a time. You can prepare and save cross-listing batches while account setup is in progress.</p>} actions={<Link href="/admin/cross-listing" className="button-primary px-4 py-2">Prepare listings</Link>} />
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Customer sign-in</h2><p>Customers can keep using their email and password. Each social option appears on the sign-in page after its application is configured and enabled.</p>
      <div className="grid gap-5 lg:grid-cols-2">{socialProviders.map((provider) => <article key={provider} className="surface-card space-y-4 p-6">
        <h3 className="text-xl font-semibold">Continue with {socialProviderLabel(provider)}</h3>
        <p className="font-semibold">{enabled.includes(provider) ? "Configured — complete a sign-in test before launch" : provider === "facebook" && facebookReview ? "Ready for review testing · public buttons hidden" : "Account setup needed"}</p>
        {provider === "facebook" && facebookReview ? <Link className="button-secondary inline-block px-4 py-2" href="/auth/facebook-review">Test Facebook sign-in</Link> : null}
        <ol className="list-decimal space-y-2 pl-5"><li>{provider === "google" ? "Create a Google Cloud project and configure Google Auth Platform for Layu Market." : "Create a Meta developer application with Facebook Login for your website."}</li><li>Add the website domain and the exact return address below.</li><li>Store the application credentials in the website&apos;s protected server settings, then enable this sign-in option.</li><li>Test registration and sign-in with a non-admin account. Complete the provider&apos;s production access requirements.</li></ol>
        <label className="block space-y-2"><span className="text-sm font-semibold">Return address for the provider</span><input readOnly className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" value={new URL(`/api/auth/social/${provider}/callback`, siteUrl).toString()} /></label>
        <p className="text-sm">Keep secret keys private. An existing Layu account connects through <Link href="/account/connections" className="underline">Sign-in methods</Link> after signing in, so another account cannot take it over through a matching email address.</p>
        <a className="button-secondary inline-block px-4 py-2" href={provider === "google" ? "https://console.cloud.google.com/auth/overview" : "https://developers.facebook.com/apps/"} target="_blank" rel="noopener noreferrer">Open {provider === "google" ? "Google setup" : "Meta app setup"}</a>
        {provider === "facebook" ? <p className="text-sm">Meta can use <a className="underline" href="/auth/data-deletion">these data-deletion instructions</a> and the website&apos;s <a className="underline" href="/privacy">privacy policy</a> during application setup.</p> : null}
      </article>)}</div>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Selling channels</h2><p>Facebook sign-in, a business Page, a Shop, and your personal Marketplace profile are separate connections. A business Page post promotes the Layu auction; it does not create a personal Marketplace item.</p>
      <div className="grid gap-5 lg:grid-cols-2">{crossListingChannels.map((channel) => {
        const connection = getDirectConnectionStatus(channel.id);
        return <article key={channel.id} className="surface-card space-y-4 p-6"><h3 className="text-xl font-semibold">{channel.label}</h3><p>{channel.summary}</p>
          <p className="font-semibold">{connection.ready ? "Configured — ready for a reviewed pilot" : channel.id === "facebook_page" || channel.id === "shopify" ? "Connection setup needed · manual preparation available" : "Guided preparation available"}</p>
          <ol className="list-decimal space-y-2 pl-5">{channel.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>
          {channel.id === "facebook_page" || channel.id === "shopify" ? <p className="text-sm">{connection.summary}</p> : null}
          {channel.id === "ebay" ? <p className="text-sm">Automatic eBay publishing is a follow-on setup step after seller policies, categories, fees, and stock handling are confirmed. The current workflow prepares the content for you to review and post.</p> : null}
          <div className="flex flex-wrap gap-3"><a className="button-secondary px-4 py-2" href={channel.openUrl} target="_blank" rel="noopener noreferrer">Open {channel.label}</a><Link className="button-ghost px-4 py-2" href="/admin/cross-listing">Prepare a batch</Link></div>
        </article>;
      })}</div>
    </section>
  </div>;
}
