import Link from "next/link";
import { parseAnnouncementVideo } from "@/lib/verification/announcement-video";
import { formatMoney } from "@/lib/money";
import { getDepositTierSettings, type DepositTierSettings } from "@/lib/verification/tiers";

export function LaunchAnnouncement({ videoUrl, policy }: { videoUrl?: string | null; policy?: Partial<DepositTierSettings> }) {
  const video = parseAnnouncementVideo(videoUrl);
  const tiers = getDepositTierSettings(policy);
  const limit = formatMoney(tiers.launchAuctionLimitCents);
  const first = formatMoney(tiers.depositTier1Cents);
  const second = formatMoney(tiers.depositTier2Cents);
  return (
    <section aria-labelledby="launch-announcement-title" className="surface-card space-y-5 border border-emerald-200 p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">A note for our launch</p>
      <h2 id="launch-announcement-title" className="text-2xl font-semibold text-zinc-950">The market is open. Come take a look.</h2>
      <p className="max-w-3xl text-zinc-700">We’re opening up Layu Market with simple requirements so you can start exploring, buying, and bidding.</p>
      <ul className="list-disc space-y-2 pl-5 text-zinc-700">
        <li>Browse freely. Confirm your email before buying or bidding.</li>
        <li><strong>Buy It Now: no deposit required, at any price.</strong></li>
        <li><strong>Auction bids of {limit} or less: no deposit required.</strong></li>
        <li>Auction bids over {limit} require approved deposits totaling at least {first} on your account. This is an account deposit, not a charge for each bid or item. Pending submissions do not unlock bidding.</li>
        <li>Our two deposit tiers are {first} and {second}. The {second} tier is reserved for later and is not required for launch.</li>
      </ul>
      <p className="max-w-3xl text-sm text-zinc-600">The {limit} limit applies to your bid before shipping. If bidding crosses {limit}, the {first} deposit requirement applies. Some listings offer both an auction and Buy It Now; buying immediately ends bidding and reserves the item for payment. Payment and pickup or shipping arrangements still apply.</p>
      <p className="max-w-3xl text-sm text-zinc-600">We plan to keep access open as long as launch runs smoothly. We may adjust requirements as we learn. Thanks for being here at the beginning.</p>
      {video ? (
        <div className="overflow-hidden rounded-xl bg-black">
          {video.kind === "youtube" ? (
            <iframe className="aspect-video w-full" src={video.src} title="Layu Market launch announcement" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : <video className="aspect-video w-full" src={video.src} controls playsInline preload="metadata" aria-label="Layu Market launch announcement" />}
        </div>
      ) : null}
      <Link className="inline-flex font-medium text-emerald-700" href="/help/verification">How buying and bidding work</Link>
    </section>
  );
}
