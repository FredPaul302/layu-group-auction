/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  CategoryCatalogMark,
  LotMarker,
  MediaBadge,
  StatusRibbon
} from "@/components/visual/auction-graphics";
import { getCurrentAuctionPriceCents } from "@/lib/auctions";
import {
  formatFulfillmentModeLabel,
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import {
  formatPublicListingStatusLabel,
  getPublicListingStatusGroup,
  getPublicListingStatusTone,
  type PublicCatalogListingLike
} from "@/lib/catalog/public-discovery";
import type { PublicListingRecord } from "@/lib/catalog/service";

export function ListingCard({ listing }: { listing: PublicListingRecord }) {
  const primaryImage = listing.images.find((image) => image.isPrimary) ?? listing.images[0];
  const imageCount = listing.images.length;
  const videoCount = listing.videos?.length ?? 0;
  const hasMedia = imageCount + videoCount > 0;
  const auctionPriceCents = listing.auction
    ? getCurrentAuctionPriceCents({
        startingBidCents: listing.auction.startingBidCents,
        currentHighestBidCents: listing.auction.currentHighestBidCents
      })
    : null;
  const publicListing = listing as PublicCatalogListingLike;
  const statusGroup = getPublicListingStatusGroup(publicListing);
  const contextLabel =
    listing.listingType === "auction" && listing.auction
      ? statusGroup === "available"
        ? `Ends ${formatUtcDateTime(listing.auction.endAtUtc)}`
        : statusGroup === "sold"
          ? "Auction settled and sold."
          : "Auction is no longer live."
      : statusGroup === "available"
        ? listing.fulfillmentMode === "shipping_only"
          ? "Available now with flat-fee shipping."
          : listing.fulfillmentMode === "pickup_or_shipping"
            ? "Available now with pickup or shipping."
            : "Available now for pickup handoff."
        : statusGroup === "reserved"
          ? "Reserved while payment review is pending."
          : statusGroup === "sold"
            ? "Sale completed through the manual review flow."
            : "This listing is no longer active in the live catalog.";

  const availabilityLabel =
    listing.listingType === "auction"
      ? statusGroup === "available"
        ? "Auction open"
        : "Auction closed"
      : statusGroup === "available"
        ? "Buy it now"
        : "Checkout paused";
  const ribbonTone =
    listing.listingType === "auction" ? "accent" : statusGroup === "reserved" ? "warning" : "info";

  return (
    <article className="listing-card surface-card motion-panel overflow-hidden">
      <p className="px-5 pt-4 text-sm text-zinc-600">Item number: <span className="font-mono font-medium">{listing.sku ?? "Not assigned"}</span></p>
      <div className="listing-card__media media-frame relative h-60">
        <Link className="block h-full w-full" href={`/listings/${listing.id}`} aria-label={`View ${listing.title}`}>
        {primaryImage ? (
          <img
            alt={primaryImage.altText ?? listing.title}
            className="listing-card__image h-full w-full object-cover"
            src={primaryImage.publicUrl}
          />
        ) : (
          <div className="media-placeholder flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <span>{videoCount > 0 ? "Video available" : "Image pending"}</span>
            {videoCount > 0 ? (
              <MediaBadge kind="video" label="Open listing to play" tone="info" />
            ) : null}
          </div>
        )}
        </Link>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <LotMarker descriptor={listing.listingType === "auction" ? "Timed" : "Fixed"} seed={listing.id} />
        </div>
        <div className="pointer-events-none absolute right-3 top-3 flex flex-wrap justify-end gap-2">
          <StatusRibbon label={availabilityLabel} tone={ribbonTone} />
          {videoCount > 0 ? <StatusBadge label={`${videoCount} video`} status="video" tone="info" /> : null}
        </div>
        {hasMedia ? (
          <div className="absolute bottom-3 right-3 flex flex-wrap gap-2">
            {imageCount > 0 ? <Link href={`/listings/${listing.id}#photos`} aria-label={`View all ${imageCount} photos of ${listing.title}`} className="photo-count-link"><MediaBadge count={imageCount} kind="photo" /></Link> : null}
            {videoCount > 0 ? (
              <Link href={`/listings/${listing.id}#videos`} aria-label={`View videos of ${listing.title}`} className="photo-count-link"><MediaBadge count={videoCount} kind="video" tone="info" /></Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="listing-card__content space-y-4 p-5">
        <div className="listing-card__identity">
          <CategoryCatalogMark name={listing.category.name} slug={listing.category.slug} />
          <span className="listing-card__category">{listing.category.name}</span>
        </div>

        <div className="listing-card__status flex flex-wrap gap-2">
          <StatusBadge label={listing.listingType === "auction" && listing.fixedPriceCents ? "Auction + Buy It Now" : formatListingTypeLabel(listing.listingType)} status={listing.listingType} />
          <StatusBadge
            label={formatPublicListingStatusLabel(publicListing)}
            status={getPublicListingStatusTone(publicListing)}
          />
          <StatusBadge
            label={listing.listingType === "fixed_price" ? "No deposit needed" : "See auction requirements"}
            status={listing.category.requiredBidTier}
          />
        </div>

        <div className="listing-card__heading space-y-2">
          <h3 className="text-xl font-semibold text-zinc-950"><Link className="listing-title-link" href={`/listings/${listing.id}`}>{listing.title}</Link></h3>
          <div className="listing-card__price-panel">
            <span className="meta-label">
              {listing.listingType === "auction" ? "Current price" : "Fixed price"}
            </span>
            <p className="listing-card__price money numeric-emphasis text-2xl text-zinc-950">
              {formatListingPriceLabel({
                listingType: listing.listingType,
                fixedPriceCents: listing.fixedPriceCents,
                auctionPriceCents
              })}
            </p>
          </div>
        </div>

        {listing.listingType === "auction" && listing.fixedPriceCents ? <p className="font-semibold text-emerald-700">Buy It Now: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(listing.fixedPriceCents / 100)}</p> : null}

        <p className="line-clamp-3 text-sm text-zinc-700">
          {listing.description ?? "Description coming soon."}
        </p>

        <p className="listing-card__context">{contextLabel}</p>

        <dl className="data-list text-sm text-zinc-700">
          <div className="data-row">
            <dt>Format</dt>
            <dd>{listing.listingType === "auction" ? "Timed auction" : "Fixed-price checkout"}</dd>
          </div>
          <div className="data-row">
            <dt>Status</dt>
            <dd>{formatPublicListingStatusLabel(publicListing)}</dd>
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
          ) : (
            <div className="data-row">
              <dt>Pickup event</dt>
              <dd>{listing.pickupEvent ? listing.pickupEvent.name : "Not attached"}</dd>
            </div>
          )}
        </dl>

        <div className="listing-card__footer flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-zinc-600">Confirm your email to buy or bid.</span>
          <Link
            className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={`/listings/${listing.id}`}
          >
            View listing
          </Link>
        </div>
      </div>
    </article>
  );
}
