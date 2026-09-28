import { ListingPhotoGallery } from "@/components/catalog/listing-photo-gallery";
import { centsToDollars } from "@/lib/money";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CategoryCatalogMark,
  LotMarker,
  StatusRibbon,
  TrustSeal
} from "@/components/visual/auction-graphics";
import {
  getAuctionBidGate,
  getCurrentAuctionPriceCents,
  getNextMinimumBidCents
} from "@/lib/auctions";
import { getCurrentUser } from "@/lib/auth";
import {
  formatFulfillmentModeLabel,
  formatListingTypeLabel,
  formatMoney,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import {
  formatPublicListingStatusLabel,
  getPublicListingStatusTone
} from "@/lib/catalog/public-discovery";
import { getPublicListingById, readStatusQueryParam } from "@/lib/catalog/service";
import { getFixedPricePayFirstGate } from "@/lib/orders";
import { buildStoredAssetRoute } from "@/lib/storage/asset-route";
import { describeVerificationPolicy } from "@/lib/verification/policy";
import { getVerificationPolicy } from "@/lib/verification/policy-service";

export const dynamic = "force-dynamic";

type ListingDetailPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getBidErrorMessage(code: string | null) {
  switch (code) {
    case "authentication_required":
      return "Sign in before placing a bid.";
    case "email_verification_required":
      return "Verify your email before placing a bid.";
    case "secondary_verification_required":
      return "Review your auction access and submit a deposit if required.";
    case "bidder_blocked":
      return "This bidder account is currently blocked.";
    case "tier_access_required":
      return "Your approved tier does not meet this category's requirement.";
    case "email_only_limit_exceeded":
      return "This bid exceeds the email-only per-item limit. Complete deposit or identity verification.";
    case "listing_not_biddable":
      return "This listing is not currently open for bidding.";
    case "auction_not_live":
      return "This auction is not currently live.";
    case "auction_closed":
      return "This auction has already ended. Refresh the page to see the settled result.";
    case "bid_amount_invalid":
      return "Enter a bid in dollars with at most two decimal places, such as 12.50.";
    case "bid_too_low":
      return "That amount is no longer high enough. Refresh and bid at or above the latest minimum.";
    default:
      return null;
  }
}

function getBidGateMessage(reason: ReturnType<typeof getAuctionBidGate>["reason"]): ReactNode {
  switch (reason) {
    case "email_only_limit_exceeded":
      return <p className="text-sm text-zinc-600">This item exceeds the email-only limit. <Link className="font-medium text-emerald-700" href="/account/verification">Upgrade your verification</Link> to bid.</p>;
    case "authentication_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/auth/login">
            Sign in
          </Link>{" "}
          to place a bid.
        </p>
      );
    case "email_verification_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/auth/verify-email"
          >
            Verify your email
          </Link>{" "}
          before bidding.
        </p>
      );
    case "secondary_verification_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/account/verification"
          >
            Review auction deposit
          </Link>{" "}
          before bidding.
        </p>
      );
    case "tier_access_required":
      return (
        <p className="text-sm text-zinc-600">
          Your approved bidding tier does not allow bids in this category.
        </p>
      );
    case "bidder_blocked":
      return <p className="text-sm text-zinc-600">This account is blocked from bidding.</p>;
    case "auction_not_live":
      return <p className="text-sm text-zinc-600">This auction is no longer live.</p>;
    case "auction_closed":
      return (
        <p className="text-sm text-zinc-600">
          This auction has ended and is waiting for the close job to settle results.
        </p>
      );
    case "listing_not_biddable":
      return <p className="text-sm text-zinc-600">This listing is not currently open for bids.</p>;
    default:
      return (
        <p className="text-sm text-zinc-600">
          Bidding details will appear here when the auction is live.
        </p>
      );
  }
}

function getPayFirstGateMessage(
  reason: ReturnType<typeof getFixedPricePayFirstGate>["reason"]
): ReactNode {
  switch (reason) {
    case "secondary_verification_required":
    case "tier_access_required":
    case "email_only_limit_exceeded":
      return <p className="text-sm text-zinc-600"><Link className="font-medium text-emerald-700" href="/account/verification">Review your verification</Link> to meet this item&apos;s category and price requirements.</p>;
    case "authentication_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/auth/login">
            Sign in
          </Link>{" "}
          to reserve this item.
        </p>
      );
    case "email_verification_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/auth/verify-email"
          >
            Verify your email
          </Link>{" "}
          before reserving this item.
        </p>
      );
    case "bidder_blocked":
      return <p className="text-sm text-zinc-600">This account is restricted from checkout.</p>;
    default:
      return (
        <p className="text-sm text-zinc-600">
          This listing is not currently available for fixed-price reservation.
        </p>
      );
  }
}

export default async function ListingDetailPage({
  params,
  searchParams
}: ListingDetailPageProps) {
  const { listingId } = await params;
  const [listing, currentUser, resolvedSearchParams, verificationPolicy] = await Promise.all([
    getPublicListingById(listingId).catch(() => notFound()),
    getCurrentUser(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    getVerificationPolicy()
  ]);

  const bidStatus = readStatusQueryParam(resolvedSearchParams.bidStatus);
  const bidError = readStatusQueryParam(resolvedSearchParams.bidError);
  const currentAuctionPriceCents =
    listing.auction && listing.listingType === "auction"
      ? getCurrentAuctionPriceCents({
          startingBidCents: listing.auction.startingBidCents,
          currentHighestBidCents: listing.auction.currentHighestBidCents
        })
      : null;
  const nextMinimumBidCents =
    listing.auction && listing.listingType === "auction"
      ? getNextMinimumBidCents({
          startingBidCents: listing.auction.startingBidCents,
          currentHighestBidCents: listing.auction.currentHighestBidCents,
          minimumIncrementCents: listing.auction.minimumIncrementCents
        })
      : null;
  const auctionBidGate =
    listing.auction && listing.listingType === "auction"
      ? getAuctionBidGate({
          subject: currentUser,
          policy: verificationPolicy,
          snapshot: {
            listingType: listing.listingType,
            listingStatus: listing.status,
            auctionStatus: listing.auction.status,
            endAtUtc: listing.auction.endAtUtc,
            startingBidCents: listing.auction.startingBidCents,
            currentHighestBidCents: listing.auction.currentHighestBidCents,
            minimumIncrementCents: listing.auction.minimumIncrementCents,
            requiredBidTier: listing.category.requiredBidTier
          },
          now: new Date()
        })
      : null;
  const fixedPricePayFirstGate =
    listing.fixedPriceCents != null
      ? getFixedPricePayFirstGate({
          subject: currentUser,
          policy: verificationPolicy,
          snapshot: {
            listingType: listing.listingType,
            listingStatus: listing.status,
            fixedPriceCents: listing.fixedPriceCents,
            auction: listing.auction,
            requiredBidTier: listing.category.requiredBidTier,
            fulfillmentMode: listing.fulfillmentMode,
            shippingFeeCents: listing.shippingFeeCents
          }
        })
      : null;
  const viewerIsWinning =
    Boolean(currentUser) &&
    Boolean(listing.auction?.currentHighestBidderId) &&
    listing.auction?.currentHighestBidderId === currentUser?.id;
  const priceSummary =
    listing.listingType === "auction" && currentAuctionPriceCents != null
      ? `Current price ${formatMoney(currentAuctionPriceCents)}`
      : listing.fixedPriceCents != null
        ? `Fixed price ${formatMoney(listing.fixedPriceCents)}`
        : "Price pending";
  const imageCount = listing.images.length;
  const videoCount = listing.videos.length;
  const mediaCount = imageCount + videoCount;
  const listingFormatLabel =
    listing.listingType === "auction" ? (listing.fixedPriceCents ? "Auction + Buy It Now" : "Timed auction") : "Fixed-price checkout";
  const actionRibbonLabel = listing.listingType === "auction" ? "Bid window" : "Pay-first claim";
  const verificationMessage = describeVerificationPolicy(verificationPolicy);

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Link className="button-secondary px-4 py-2 text-sm font-medium" href="/listings">
              Back to listings
            </Link>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href={`/categories/${listing.category.slug}`}
            >
              Browse {listing.category.name}
            </Link>
          </>
        }
        description={
          <p>
            {priceSummary} in {listing.category.name}, with{" "}
            {formatFulfillmentModeLabel(listing.fulfillmentMode).toLowerCase()} fulfillment.
          </p>
        }
        eyebrow={formatListingTypeLabel(listing.listingType)}
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Listing status</span>
              <div className="pt-1">
                <StatusBadge
                  label={formatPublicListingStatusLabel(listing)}
                  status={getPublicListingStatusTone(listing)}
                />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Fulfillment</span>
              <span className="meta-value">{formatFulfillmentModeLabel(listing.fulfillmentMode)}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Category tier</span>
              <div className="pt-1">
                <StatusBadge
                  label={listing.category.name}
                  status={listing.category.requiredBidTier}
                />
              </div>
            </div>
          </>
        }
        title={listing.title}
      />

      <section className="listing-detail__identity motion-panel motion-delay-2">
        <LotMarker descriptor={listing.listingType === "auction" ? "Timed lot" : "Fixed lot"} seed={listing.id} />
        <CategoryCatalogMark name={listing.category.name} showLabel slug={listing.category.slug} />
        <StatusRibbon
          label={actionRibbonLabel}
          tone={listing.listingType === "auction" ? "accent" : "info"}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="metric-card">
          <span className="meta-label">{listing.listingType === "auction" ? "Current bid" : "Price"}</span>
          <span className="meta-value money">
            {listing.listingType === "auction"
              ? currentAuctionPriceCents == null
                ? "Pending"
                : formatMoney(currentAuctionPriceCents)
              : listing.fixedPriceCents == null
                ? "Pending"
                : formatMoney(listing.fixedPriceCents)}
          </span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Sale format</span>
          <span className="meta-value">{listingFormatLabel}</span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Media</span>
          <span className="meta-value">
            {mediaCount === 0
              ? "Pending"
              : `${imageCount} photo${imageCount === 1 ? "" : "s"}${
                  videoCount > 0 ? `, ${videoCount} video${videoCount === 1 ? "" : "s"}` : ""
                }`}
          </span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Buyer step</span>
          <span className="meta-value">
            {listing.listingType === "auction" ? "Bid after verification" : "Reserve after email verification"}
          </span>
        </div>
      </section>

      <section className="listing-detail-grid grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4">
          <ListingPhotoGallery images={listing.images.map(({ id, publicUrl, altText, isPrimary }) => ({ id, publicUrl, altText, isPrimary }))} title={listing.title} />

          {listing.videos.length > 0 ? (
            <div className="space-y-3" id="videos">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-950">Video</h2>
                <span className="text-sm text-zinc-600">{videoCount} video{videoCount === 1 ? "" : "s"}</span>
              </div>
              {listing.videos.map((video) => (
                <div key={video.id} className="media-frame motion-panel motion-delay-3 overflow-hidden">
                  <video
                    className="aspect-video w-full bg-black object-contain"
                    controls
                    preload="metadata"
                  >
                    <source
                      src={video.publicUrl ?? buildStoredAssetRoute(video.storageKey)}
                      type={video.contentType}
                    />
                  </video>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="listing-detail-aside space-y-6 lg:sticky lg:top-6 lg:self-start">
          {listing.listingType === "auction" && listing.auction ? (
            <section className="detail-panel detail-panel-accent surface-elevated motion-panel motion-delay-2 space-y-5 p-5">
              <TrustSeal
                kind="verified"
                title="Verified bidder entry"
                caption="Email and the current auction verification requirements apply"
              />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-950">Bidding</h3>
                <p className="text-sm text-zinc-600">
                  {verificationMessage}
                </p>
              </div>

              {bidStatus === "placed" ? (
                <p className="notice notice-success">
                  Bid placed successfully.
                </p>
              ) : null}

              {bidError ? (
                <p className="notice notice-danger">
                  {getBidErrorMessage(bidError)}
                </p>
              ) : null}

              <dl className="metric-grid text-sm text-zinc-700">
                <div className="metric-card price-metric">
                  <dt className="meta-label">Current price</dt>
                  <dd className="money numeric-emphasis mt-1 font-medium text-zinc-950">
                    {currentAuctionPriceCents == null
                      ? "Pending"
                      : formatMoney(currentAuctionPriceCents)}
                  </dd>
                </div>
                <div className="metric-card price-metric">
                  <dt className="meta-label">Next minimum bid</dt>
                  <dd className="money numeric-emphasis mt-1 font-medium text-zinc-950">
                    {nextMinimumBidCents == null ? "Pending" : formatMoney(nextMinimumBidCents)}
                  </dd>
                </div>
                <div className="metric-card">
                  <dt className="meta-label">Auction end</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {formatUtcDateTime(listing.auction.endAtUtc)}
                  </dd>
                </div>
              </dl>

              {viewerIsWinning ? (
                <p className="notice notice-success">
                  You are currently the highest bidder.
                </p>
              ) : null}

              {auctionBidGate?.canBid && nextMinimumBidCents != null ? (
                <form action={`/api/listings/${listing.id}/bids`} className="space-y-4" method="post">
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span className="font-medium text-zinc-900">Bid amount ($)</span>
                    <input
                      className="tabular-data"
                      defaultValue={centsToDollars(nextMinimumBidCents)}
                      min={centsToDollars(nextMinimumBidCents)}
                      name="amount"
                      required
                      step="0.01"
                      inputMode="decimal"
                      type="number"
                    />
                  </label>

                  <button
                    className="button-primary px-4 py-2 text-sm font-medium"
                    type="submit"
                  >
                    Place bid
                  </button>
                </form>
              ) : (
                getBidGateMessage(auctionBidGate?.reason ?? null)
              )}
            </section>
          ) : null}

          {listing.fixedPriceCents != null ? (
            <section className="detail-panel detail-panel-accent surface-elevated motion-panel motion-delay-2 space-y-5 p-5">
              <TrustSeal
                kind="secure"
                motif="gaming"
                title="Secure account claim"
                caption="Email-verified buyers reserve before manual payment review"
              />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-950">Buy it now</h3>
                <p className="text-sm text-zinc-600">
                  Start checkout with a logged-in, email-verified account. Buy it now reserves the
                  item immediately while payment is still reviewed manually. No deposit is required at any price. {listing.listingType === "auction" ? "Buying ends bidding. Buy It Now stays available until the auction ends or bidding reaches the Buy It Now price." : ""}
                </p>
              </div>

              <dl className="metric-grid text-sm text-zinc-700">
                <div className="metric-card price-metric">
                  <dt className="meta-label">Price</dt>
                  <dd className="money numeric-emphasis mt-1 font-medium text-zinc-950">
                    {listing.fixedPriceCents == null ? "Pending" : formatMoney(listing.fixedPriceCents)}
                  </dd>
                </div>
                <div className="metric-card">
                  <dt className="meta-label">Shipping fee</dt>
                  <dd className="money mt-1 font-medium text-zinc-950">
                    {listing.fulfillmentMode === "shipping_only"
                      ? formatMoney(listing.shippingFeeCents)
                      : listing.fulfillmentMode === "pickup_or_shipping"
                        ? "Depends on fulfillment choice"
                        : formatMoney(0)}
                  </dd>
                </div>
              </dl>

              <p className="notice notice-info text-sm">
                Your reservation is held during the payment window. Admin approval is still
                required before the sale is finalized. If a combined listing’s reservation fails, the seller must relist it; the auction does not restart automatically.
              </p>

              {fixedPricePayFirstGate?.canStartCheckout ? (
                <Link
                  className="button-primary px-4 py-2 text-sm font-medium"
                  href={`/listings/${listing.id}/claim`}
                >
                  Buy it now
                </Link>
              ) : (
                getPayFirstGateMessage(fixedPricePayFirstGate?.reason ?? null)
              )}
            </section>
          ) : null}

          <section className="detail-panel surface-card motion-panel motion-delay-3 space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={formatPublicListingStatusLabel(listing)}
                status={getPublicListingStatusTone(listing)}
              />
              {listing.listingType === "auction" && listing.auction ? (
                <StatusBadge status={listing.auction.status} />
              ) : null}
            </div>
            <h3 className="text-lg font-semibold text-zinc-950">Details</h3>
            <dl className="data-list text-sm text-zinc-700">
              <div className="data-row">
                <dt>Listing status</dt>
                <dd>{formatPublicListingStatusLabel(listing)}</dd>
              </div>
              <div className="data-row">
                <dt>Category</dt>
                <dd>{listing.category.name}</dd>
              </div>
              <div className="data-row">
                <dt>Fulfillment</dt>
                <dd>{formatFulfillmentModeLabel(listing.fulfillmentMode)}</dd>
              </div>
              {listing.listingType === "auction" && listing.auction ? (
                <div className="data-row">
                  <dt>Auction end</dt>
                  <dd>{formatUtcDateTime(listing.auction.endAtUtc)}</dd>
                </div>
              ) : null}
              {listing.fulfillmentMode !== "pickup_only" ? (
                <div className="data-row">
                  <dt>Shipping fee</dt>
                  <dd>{formatMoney(listing.shippingFeeCents)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="detail-panel detail-panel-muted surface-card motion-panel motion-delay-3 space-y-4 p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-zinc-950">Participation standard</h3>
              <p className="text-sm text-zinc-600">
                Verification, payment review, and fulfillment stay explicit so the public listing
                reads like the real process behind it.
              </p>
            </div>

            <div className="detail-trust-grid">
              <article className="detail-trust-card">
                <TrustSeal
                  kind="verified"
                  motif="botanical"
                  title="Verified bidder path"
                />
                <p className="text-sm text-zinc-600">{verificationMessage}</p>
              </article>
              <article className="detail-trust-card">
                <TrustSeal
                  kind="payment"
                  title="Manual payment review"
                />
                <p className="text-sm text-zinc-600">
                  Payments stay external through PayPal, Venmo, or Cash App. Buy it now reserves
                  the item first, and manual admin approval is what makes the sale official.
                </p>
              </article>
              <article className="detail-trust-card">
                <TrustSeal
                  kind="seller"
                  motif="cat"
                  title="Seller-reviewed handoff"
                />
                <p className="text-sm text-zinc-600">
                  {listing.fulfillmentMode === "pickup_only"
                    ? "This listing resolves through pickup only."
                    : listing.fulfillmentMode === "shipping_only"
                      ? "This listing resolves through flat-fee shipping only."
                      : "This listing supports either pickup or flat-fee shipping once the order is ready."}
                </p>
              </article>
            </div>
          </section>

          <section className="detail-panel surface-card motion-panel motion-delay-3 space-y-3 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Description</h3>
            <p className="text-sm leading-6 text-zinc-700">
              {listing.description ?? "No description has been added yet."}
            </p>
            {listing.conditionNote ? (
              <p className="notice notice-info text-sm">Condition note: {listing.conditionNote}</p>
            ) : null}
          </section>

          <section className="detail-panel surface-card motion-panel motion-delay-3 space-y-3 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Pickup and shipping</h3>
            {listing.pickupEvent ? (
              <div className="surface-elevated space-y-2 p-4 text-sm text-zinc-700">
                <p className="font-medium text-zinc-950">{listing.pickupEvent.name}</p>
                <p>{listing.pickupEvent.locationName}</p>
                {listing.pickupEvent.address ? <p>{listing.pickupEvent.address}</p> : null}
                <p>
                  {formatUtcDateTime(listing.pickupEvent.startAtUtc)} to{" "}
                  {formatUtcDateTime(listing.pickupEvent.endAtUtc)}
                </p>
                {listing.pickupEvent.instructions ? <p>{listing.pickupEvent.instructions}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No pickup event is attached to this listing.</p>
            )}

            {listing.shippingNotes ? (
              <p className="notice notice-info text-sm">Shipping notes: {listing.shippingNotes}</p>
            ) : null}
          </section>

          <section className="detail-panel detail-panel-muted surface-card motion-panel motion-delay-3 space-y-2 border-dashed p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Payment status</h3>
            <p className="text-sm text-zinc-600">
              Payments remain manual external submissions only. Order payment pages and admin review
              are available after a buy-it-now reservation starts, an auction win, or an accepted
              runner-up offer.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
