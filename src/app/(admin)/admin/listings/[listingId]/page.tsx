/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentAuctionPriceCents } from "@/lib/auctions";
import {
  formatAdminListingStatusLabel,
  formatFulfillmentModeLabel,
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatOrderStatusLabel,
  getAdminListingStatusTone,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getListingEditorData, readStatusQueryParam } from "@/lib/catalog/service";
import { buildStoredAssetRoute } from "@/lib/storage/asset-route";

type AdminListingDetailPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminListingDetailPage({
  params,
  searchParams
}: AdminListingDetailPageProps) {
  const { listingId } = await params;
  const resolvedSearchParams = await (
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const listing = await getListingEditorData(listingId).catch(() => notFound());
  const latestOrder = listing.orders[0] ?? null;
  const latestPayment = latestOrder?.payments[0] ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/listings/${listing.id}/edit`}>
              Edit listing
            </Link>
            {listing.status !== "draft" && listing.status !== "archived" ? (
              <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/listings/${listing.id}`}>
                View public page
              </Link>
            ) : null}
            {listing.status === "draft" ? (
              <form action={`/api/admin/listings/${listing.id}/publish`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  Publish
                </button>
              </form>
            ) : null}
            {listing.status === "published" ? (
              <form action={`/api/admin/listings/${listing.id}/unpublish`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  Unpublish
                </button>
              </form>
            ) : null}
            {listing.listingType === "auction" &&
            listing.status === "published" &&
            listing.auction?.status === "live" ? (
              <form action={`/api/admin/listings/${listing.id}/close`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  End auction now
                </button>
              </form>
            ) : null}
            <form action={`/api/admin/listings/${listing.id}/duplicate`} method="post">
              <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                Duplicate into draft
              </button>
            </form>
          </>
        }
        description={
          <p>
            Admin preview for draft and live listings, with direct links into orders and payments when the listing has moved into commerce.
          </p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Lifecycle</span>
              <span className="meta-value">
                {formatAdminListingStatusLabel({
                  listingType: listing.listingType,
                  listingStatus: listing.status,
                  auctionStatus: listing.auction?.status ?? null
                })}
              </span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Orders</span>
              <span className="meta-value tabular-data">{listing.orders.length}</span>
            </div>
          </>
        }
        title={listing.title}
      />

      {status ? (
        <p className="notice notice-success">{status.replaceAll("_", " ")}</p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Summary</h3>
            <dl className="mt-4 space-y-3 text-sm text-zinc-700">
              <div className="flex justify-between gap-4">
                <dt>Status</dt>
                <dd>
                  <StatusBadge
                    label={formatAdminListingStatusLabel({
                      listingType: listing.listingType,
                      listingStatus: listing.status,
                      auctionStatus: listing.auction?.status ?? null
                    })}
                    status={getAdminListingStatusTone({
                      listingType: listing.listingType,
                      listingStatus: listing.status,
                      auctionStatus: listing.auction?.status ?? null
                    })}
                  />
                </dd>
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
              <div className="flex justify-between gap-4">
                <dt>Price</dt>
                <dd>
                  {formatListingPriceLabel({
                    listingType: listing.listingType,
                    fixedPriceCents: listing.fixedPriceCents,
                    auctionPriceCents: listing.auction
                      ? getCurrentAuctionPriceCents({
                          startingBidCents: listing.auction.startingBidCents,
                          currentHighestBidCents: listing.auction.currentHighestBidCents
                        })
                      : null
                  })}
                </dd>
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

          <div className="surface-card p-5">
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

          <div className="surface-card p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Related commerce</h3>
            {latestOrder ? (
              <div className="mt-4 space-y-3 text-sm text-zinc-700">
                <p>
                  Latest order status <strong>{formatOrderStatusLabel(latestOrder.status)}</strong>
                </p>
                <p>
                  Buyer {latestOrder.buyerUser.displayName ?? latestOrder.buyerUser.email}
                </p>
                {latestPayment ? (
                  <p>
                    Latest payment {latestPayment.status} via {latestPayment.sitePaymentMethod.displayName}
                  </p>
                ) : (
                  <p>No payment submitted yet.</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/orders?listingId=${listing.id}`}>
                    View related orders
                  </Link>
                  <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/payments?listingId=${listing.id}`}>
                    View related payments
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-600">
                No orders or payment submissions are attached to this listing yet.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5">
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

          <div className="surface-card p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Videos</h3>
            {listing.videos.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">No videos uploaded yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {listing.videos.map((video) => (
                  <video
                    key={video.id}
                    className="aspect-video w-full rounded-md border border-zinc-200 bg-black object-contain"
                    controls
                    preload="metadata"
                  >
                    <source
                      src={video.publicUrl ?? buildStoredAssetRoute(video.storageKey)}
                      type={video.contentType}
                    />
                  </video>
                ))}
              </div>
            )}
          </div>

          {listing.pickupEvent ? (
            <div className="surface-card p-5">
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
