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
import type { PublicListingRecord } from "@/lib/catalog/service";
import {
  formatBidTierLabel,
  formatFulfillmentModeLabel,
  formatListingTypeLabel,
  formatMoney,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import {
  formatPublicListingStatusLabel,
  getPublicListingStatusGroup,
  getPublicListingStatusTone,
  type PublicCatalogListingLike
} from "@/lib/catalog/public-discovery";

type ListingSpotlightProps = {
  listing: PublicListingRecord;
  eyebrow?: string;
  summary?: string;
  hrefLabel?: string;
};

export function ListingSpotlight({
  listing,
  eyebrow,
  summary,
  hrefLabel = "Open listing"
}: ListingSpotlightProps) {
  const primaryImage = listing.images.find((image) => image.isPrimary) ?? listing.images[0];
  const auctionPriceCents = listing.auction
    ? getCurrentAuctionPriceCents({
        startingBidCents: listing.auction.startingBidCents,
        currentHighestBidCents: listing.auction.currentHighestBidCents
      })
    : null;
  const priceCents =
    listing.listingType === "auction"
      ? auctionPriceCents
      : listing.fixedPriceCents;
  const publicListing = listing as PublicCatalogListingLike;
  const statusGroup = getPublicListingStatusGroup(publicListing);
  const timingLabel =
    listing.listingType === "auction" && listing.auction
      ? statusGroup === "available"
        ? `Ends ${formatUtcDateTime(listing.auction.endAtUtc)}`
        : "Auction is no longer live."
      : statusGroup === "reserved"
        ? "Reserved while payment review is pending."
        : statusGroup === "sold"
          ? "Sold through the manual payment review flow."
          : listing.fulfillmentMode === "shipping_only"
            ? `Flat shipping ${formatMoney(listing.shippingFeeCents)}`
            : listing.fulfillmentMode === "pickup_or_shipping"
              ? "Pickup or shipping available"
              : "Pickup handoff only";
  const mediaCount = listing.images.length + (listing.videos?.length ?? 0);
  const ribbonTone =
    listing.listingType === "auction" ? "accent" : statusGroup === "reserved" ? "warning" : "info";

  return (
    <article className="listing-spotlight surface-card motion-panel overflow-hidden">
      <div className="listing-spotlight__media media-frame relative">
        {primaryImage ? (
          <img
            alt={primaryImage.altText ?? listing.title}
            className="listing-spotlight__image h-full w-full object-cover"
            src={primaryImage.publicUrl}
          />
        ) : (
          <div className="media-placeholder flex h-full min-h-72 items-center justify-center text-sm text-zinc-500">
            Image pending
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <LotMarker descriptor={listing.listingType === "auction" ? "Timed" : "Fixed"} seed={listing.id} />
        </div>
        <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-2">
          <StatusRibbon
            label={listing.listingType === "auction" ? "Catalog auction" : "Ready now"}
            tone={ribbonTone}
          />
          {mediaCount > 0 ? <MediaBadge count={mediaCount} kind="lot" label={`${mediaCount} media`} /> : null}
        </div>
      </div>

      <div className="listing-spotlight__body space-y-5 p-5 md:p-6">
        <div className="space-y-3">
          <div className="listing-spotlight__identity">
            <div className="flex items-center gap-2">
              <CategoryCatalogMark name={listing.category.name} slug={listing.category.slug} />
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={formatListingTypeLabel(listing.listingType)}
              status={listing.listingType}
            />
            <StatusBadge
              label={formatPublicListingStatusLabel(publicListing)}
              status={getPublicListingStatusTone(publicListing)}
            />
            <StatusBadge
              label={formatBidTierLabel(listing.category.requiredBidTier)}
              status={listing.category.requiredBidTier}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">{listing.title}</h3>
            <p className="text-sm text-zinc-600">
              {summary ?? listing.description ?? "Listing details are available now."}
            </p>
          </div>

          <div className="space-y-1">
            <p className="meta-label">
              {listing.listingType === "auction" ? "Current price" : "Fixed price"}
            </p>
            <p className="money numeric-emphasis text-zinc-950">
              {priceCents == null ? "Price pending" : formatMoney(priceCents)}
            </p>
            <p className="text-sm text-zinc-600">{timingLabel}</p>
          </div>
        </div>

        <dl className="metric-grid">
          <div className="metric-card">
            <span className="meta-label">Category</span>
            <span className="meta-value">{listing.category.name}</span>
          </div>
          <div className="metric-card">
            <span className="meta-label">Fulfillment</span>
            <span className="meta-value">
              {formatFulfillmentModeLabel(listing.fulfillmentMode)}
            </span>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-4">
          <Link
            className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={`/listings/${listing.id}`}
          >
            {hrefLabel}
          </Link>
          <Link
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-950"
            href={`/categories/${listing.category.slug}`}
          >
            Browse {listing.category.name}
          </Link>
        </div>
      </div>
    </article>
  );
}
