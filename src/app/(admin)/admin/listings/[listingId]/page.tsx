/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatFulfillmentModeLabel,
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getListingEditorData } from "@/lib/catalog/service";

type AdminListingDetailPageProps = {
  params: Promise<{
    listingId: string;
  }>;
};

export default async function AdminListingDetailPage({
  params
}: AdminListingDetailPageProps) {
  const { listingId } = await params;
  const listing = await getListingEditorData(listingId).catch(() => notFound());

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-semibold text-zinc-950">{listing.title}</h2>
            <p className="text-base text-zinc-600">
              {formatListingPriceLabel({
                listingType: listing.listingType,
                fixedPriceCents: listing.fixedPriceCents,
                startingBidCents: listing.auction?.startingBidCents ?? null
              })}
            </p>
          </div>

          <Link
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            href={`/admin/listings/${listing.id}/edit`}
          >
            Edit listing
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Summary</h3>
            <dl className="mt-4 space-y-3 text-sm text-zinc-700">
              <div className="flex justify-between gap-4">
                <dt>Status</dt>
                <dd>{listing.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Type</dt>
                <dd>{formatListingTypeLabel(listing.listingType)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Category</dt>
                <dd>{listing.category.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Fulfillment</dt>
                <dd>{formatFulfillmentModeLabel(listing.fulfillmentMode)}</dd>
              </div>
              {listing.auction ? (
                <div className="flex justify-between gap-4">
                  <dt>Auction end</dt>
                  <dd>{formatUtcDateTime(listing.auction.endAtUtc)}</dd>
                </div>
              ) : null}
              {listing.publishedAtUtc ? (
                <div className="flex justify-between gap-4">
                  <dt>Published at</dt>
                  <dd>{formatUtcDateTime(listing.publishedAtUtc)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Description</h3>
            <p className="mt-4 text-sm leading-6 text-zinc-700">
              {listing.description ?? "No description has been added yet."}
            </p>
            {listing.conditionNote ? (
              <p className="mt-3 text-sm text-zinc-600">Condition note: {listing.conditionNote}</p>
            ) : null}
            {listing.shippingNotes ? (
              <p className="mt-3 text-sm text-zinc-600">Shipping notes: {listing.shippingNotes}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Images</h3>
            {listing.images.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">No images uploaded yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {listing.images.map((image) => (
                  <img
                    key={image.id}
                    alt={image.altText ?? listing.title}
                    className="h-40 w-full rounded-md border border-zinc-200 object-cover"
                    src={image.publicUrl}
                  />
                ))}
              </div>
            )}
          </div>

          {listing.pickupEvent ? (
            <div className="rounded-md border border-zinc-200 p-5">
              <h3 className="text-lg font-semibold text-zinc-950">Pickup event</h3>
              <div className="mt-4 space-y-1 text-sm text-zinc-700">
                <p className="font-medium text-zinc-950">{listing.pickupEvent.name}</p>
                <p>{listing.pickupEvent.locationName}</p>
                {listing.pickupEvent.address ? <p>{listing.pickupEvent.address}</p> : null}
                <p>
                  {formatUtcDateTime(listing.pickupEvent.startAtUtc)} to{" "}
                  {formatUtcDateTime(listing.pickupEvent.endAtUtc)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
