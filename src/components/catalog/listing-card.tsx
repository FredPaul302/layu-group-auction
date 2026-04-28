/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentAuctionPriceCents } from "@/lib/auctions";
import {
  formatBidTierLabel,
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

  return (
    <article className="listing-card surface-card motion-panel overflow-hidden">
      <div className="listing-card__media media-frame h-56">
        {primaryImage ? (
          <img
            alt={primaryImage.altText ?? listing.title}
            className="listing-card__image h-full w-full object-cover"
            src={primaryImage.publicUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-100 text-sm text-zinc-500">
            Image pending
          </div>
        )}
      </div>

      <div className="listing-card__content space-y-4 p-5">
        <div className="listing-card__status flex flex-wrap gap-2">
          <StatusBadge label={formatListingTypeLabel(listing.listingType)} status={listing.listingType} />
          <StatusBadge
            label={formatPublicListingStatusLabel(publicListing)}
            status={getPublicListingStatusTone(publicListing)}
          />
          <StatusBadge
            label={formatBidTierLabel(listing.category.requiredBidTier)}
            status={listing.category.requiredBidTier}
          />
        </div>

        <div className="listing-card__heading space-y-2">
          <h3 className="text-xl font-semibold text-zinc-950">{listing.title}</h3>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="listing-card__price money numeric-emphasis text-zinc-950">
              {formatListingPriceLabel({
                listingType: listing.listingType,
                fixedPriceCents: listing.fixedPriceCents,
                auctionPriceCents
              })}
            </p>
            <p className="text-sm text-zinc-600">{listing.category.name}</p>
          </div>
        </div>

        <p className="line-clamp-3 text-sm text-zinc-700">
          {listing.description ?? "Description coming soon."}
        </p>

        <p className="listing-card__context">{contextLabel}</p>

        <dl className="data-list text-sm text-zinc-700">
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
          <span className="text-sm text-zinc-600">Read-only until eligibility and payment rules apply.</span>
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
