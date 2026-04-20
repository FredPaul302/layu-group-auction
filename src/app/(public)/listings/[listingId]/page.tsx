/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatFulfillmentModeLabel,
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatMoney,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getPublicListingById } from "@/lib/catalog/service";

type ListingDetailPageProps = {
  params: Promise<{
    listingId: string;
  }>;
};

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { listingId } = await params;
  const listing = await getPublicListingById(listingId).catch(() => notFound());
  const primaryImage = listing.images.find((image) => image.isPrimary) ?? listing.images[0];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {formatListingTypeLabel(listing.listingType)}
          </p>
          <h2 className="text-3xl font-semibold text-zinc-950">{listing.title}</h2>
          <p className="text-base text-zinc-600">
            {formatListingPriceLabel({
              listingType: listing.listingType,
              fixedPriceCents: listing.fixedPriceCents,
              startingBidCents: listing.auction?.startingBidCents ?? null
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/listings">
            Back to listings
          </Link>
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href={`/categories/${listing.category.slug}`}
          >
            Browse {listing.category.name}
          </Link>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4">
          {primaryImage ? (
            <img
              alt={primaryImage.altText ?? listing.title}
              className="h-auto w-full rounded-md border border-zinc-200 object-cover"
              src={primaryImage.publicUrl}
            />
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-100 text-sm text-zinc-500">
              Image pending
            </div>
          )}

          {listing.images.length > 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {listing.images.slice(1).map((image) => (
                <img
                  key={image.id}
                  alt={image.altText ?? listing.title}
                  className="h-44 w-full rounded-md border border-zinc-200 object-cover"
                  src={image.publicUrl}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Details</h3>
            <dl className="space-y-3 text-sm text-zinc-700">
              <div className="flex justify-between gap-4">
                <dt>Category</dt>
                <dd>{listing.category.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Fulfillment</dt>
                <dd>{formatFulfillmentModeLabel(listing.fulfillmentMode)}</dd>
              </div>
              {listing.listingType === "auction" && listing.auction ? (
                <div className="flex justify-between gap-4">
                  <dt>Auction end</dt>
                  <dd>{formatUtcDateTime(listing.auction.endAtUtc)}</dd>
                </div>
              ) : null}
              {listing.fulfillmentMode !== "pickup_only" ? (
                <div className="flex justify-between gap-4">
                  <dt>Shipping fee</dt>
                  <dd>{formatMoney(listing.shippingFeeCents)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Description</h3>
            <p className="text-sm leading-6 text-zinc-700">
              {listing.description ?? "No description has been added yet."}
            </p>
            {listing.conditionNote ? (
              <p className="text-sm text-zinc-600">Condition note: {listing.conditionNote}</p>
            ) : null}
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Pickup and shipping</h3>
            {listing.pickupEvent ? (
              <div className="space-y-1 text-sm text-zinc-700">
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
              <p className="text-sm text-zinc-600">Shipping notes: {listing.shippingNotes}</p>
            ) : null}
          </section>

          <section className="space-y-2 rounded-md border border-dashed border-zinc-300 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Commerce status</h3>
            <p className="text-sm text-zinc-600">
              Bid and purchase controls remain disabled in this phase. Email verification and
              secondary verification rules are preserved and will gate commerce when those flows are
              turned on.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
