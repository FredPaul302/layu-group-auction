/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import type { PublicListingRecord } from "@/lib/catalog/service";
import {
  formatFulfillmentModeLabel,
  formatListingPriceLabel,
  formatListingTypeLabel
} from "@/lib/catalog/presentation";

export function ListingCard({ listing }: { listing: PublicListingRecord }) {
  const primaryImage = listing.images.find((image) => image.isPrimary) ?? listing.images[0];

  return (
    <article className="overflow-hidden rounded-md border border-zinc-200">
      {primaryImage ? (
        <img
          alt={primaryImage.altText ?? listing.title}
          className="h-52 w-full object-cover"
          src={primaryImage.publicUrl}
        />
      ) : (
        <div className="flex h-52 items-center justify-center bg-zinc-100 text-sm text-zinc-500">
          Image pending
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
          <span>{formatListingTypeLabel(listing.listingType)}</span>
          <span>{listing.category.name}</span>
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-950">{listing.title}</h3>
          <p className="text-sm text-zinc-600">{formatListingPriceLabel({
            listingType: listing.listingType,
            fixedPriceCents: listing.fixedPriceCents,
            startingBidCents: listing.auction?.startingBidCents ?? null
          })}</p>
        </div>

        <p className="line-clamp-3 text-sm text-zinc-700">
          {listing.description ?? "Description coming soon."}
        </p>

        <div className="space-y-1 text-sm text-zinc-600">
          <p>{formatFulfillmentModeLabel(listing.fulfillmentMode)}</p>
          {listing.pickupEvent ? <p>Pickup event: {listing.pickupEvent.name}</p> : null}
        </div>

        <Link
          className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
          href={`/listings/${listing.id}`}
        >
          View listing
        </Link>
      </div>
    </article>
  );
}
