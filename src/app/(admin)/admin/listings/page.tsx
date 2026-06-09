import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { archiveListingAction } from "@/lib/catalog/actions";
import {
  formatAdminListingStatusLabel,
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatOrderStatusLabel,
  getAdminListingStatusTone,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { listAdminListings, readStatusQueryParam } from "@/lib/catalog/service";
import { getCurrentAuctionPriceCents } from "@/lib/auctions";

type AdminListingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ListingSortKey = "updated_desc" | "title_asc" | "deadline_asc";

const listingStatusOptions = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "live_auction", label: "Live auction" },
  { value: "published", label: "Published" },
  { value: "sold_pending_payment", label: "Sold pending payment" },
  { value: "paid_or_sold", label: "Paid / sold" },
  { value: "closed", label: "Expired / closed" },
  { value: "archived", label: "Archived" }
] as const;

const listingTypeOptions = [
  { value: "all", label: "All types" },
  { value: "auction", label: "Auction" },
  { value: "fixed_price", label: "Fixed price" }
] as const;

const listingSortOptions = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "deadline_asc", label: "Deadline first" },
  { value: "title_asc", label: "Title A-Z" }
] as const;

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div className={tone === "error" ? "notice notice-danger" : "notice notice-success"}>
      {message}
    </div>
  );
}

function getFirstValue(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function matchesStatusFilter(
  listing: Awaited<ReturnType<typeof listAdminListings>>[number],
  statusFilter: string
) {
  if (statusFilter === "all") {
    return true;
  }

  if (
    statusFilter === "live_auction" &&
    listing.listingType === "auction" &&
    listing.status === "published" &&
    listing.auction?.status === "live"
  ) {
    return true;
  }

  if (
    statusFilter === "paid_or_sold" &&
    ["paid", "ready_for_fulfillment", "fulfilled"].includes(listing.status)
  ) {
    return true;
  }

  if (
    statusFilter === "closed" &&
    (listing.status === "unsold" || listing.auction?.status === "ended_no_bids")
  ) {
    return true;
  }

  return listing.status === statusFilter;
}

function sortListings(
  listings: Awaited<ReturnType<typeof listAdminListings>>,
  sortKey: ListingSortKey
) {
  return [...listings].sort((left, right) => {
    if (sortKey === "title_asc") {
      return left.title.localeCompare(right.title);
    }

    if (sortKey === "deadline_asc") {
      const leftDeadline = left.auction?.endAtUtc?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = right.auction?.endAtUtc?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftDeadline !== rightDeadline) {
        return leftDeadline - rightDeadline;
      }
    }

    return right.updatedAtUtc.getTime() - left.updatedAtUtc.getTime();
  });
}

export default async function AdminListingsPage({
  searchParams
}: AdminListingsPageProps) {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const listings = await listAdminListings();
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const createCount = getFirstValue(resolvedSearchParams.count, "0");
  const statusFilter = getFirstValue(resolvedSearchParams.statusFilter, "all");
  const typeFilter = getFirstValue(resolvedSearchParams.type, "all");
  const sortKey = getFirstValue(
    resolvedSearchParams.sort,
    "updated_desc"
  ) as ListingSortKey;

  const filteredListings = sortListings(
    listings.filter((listing) => {
      const matchesType = typeFilter === "all" || listing.listingType === typeFilter;
      return matchesType && matchesStatusFilter(listing, statusFilter);
    }),
    sortKey
  );

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Link className="button-secondary px-4 py-2 text-sm font-medium" href="/admin/listings/bulk">
              Bulk listings
            </Link>
            <Link className="button-primary px-4 py-2 text-sm font-medium" href="/admin/listings/new">
              Create listing
            </Link>
          </>
        }
        description={
          <p>
            Create auction or fixed-price listings, batch-create fixed-price inventory, publish or
            unpublish from the queue, and jump directly into related orders and payment reviews.
          </p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Total listings</span>
              <span className="meta-value tabular-data">{listings.length}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Filtered view</span>
              <span className="meta-value tabular-data">{filteredListings.length}</span>
            </div>
          </>
        }
        title="Listings"
      />

      {status === "listing_archived" ? (
        <Feedback message="Listing archived." tone="success" />
      ) : null}
      {status === "listing_batch_created" ? (
        <Feedback message={`${createCount} listings created.`} tone="success" />
      ) : null}

      <form className="surface-card grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" method="get">
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Status</span>
          <select className="w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={statusFilter} name="statusFilter">
            {listingStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Type</span>
          <select className="w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={typeFilter} name="type">
            {listingTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Sort</span>
          <select className="w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={sortKey} name="sort">
            {listingSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
            Apply
          </button>
          <Link className="button-ghost px-0 py-0 text-sm font-medium" href="/admin/listings">
            Reset
          </Link>
        </div>
      </form>

      <section className="space-y-4">
        {filteredListings.length === 0 ? (
          <EmptyState description="No listings match the current filters." title="No listings in this view" />
        ) : (
          <div className="space-y-4">
            {filteredListings.map((listing) => {
              const latestOrder = listing.orders[0] ?? null;
              const latestPayment = latestOrder?.payments[0] ?? null;

              return (
                <article key={listing.id} className="surface-card fade-in p-5">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
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
                          <StatusBadge
                            label={formatListingTypeLabel(listing.listingType)}
                            status={listing.listingType}
                          />
                          <StatusBadge label={listing.category.name} status={listing.category.requiredBidTier} />
                        </div>
                        <h3 className="text-xl font-semibold text-zinc-950">{listing.title}</h3>
                        <div className="space-y-1 text-sm text-zinc-600">
                          <p>
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
                          </p>
                          <p>
                            {listing.auction
                              ? `Deadline ${formatUtcDateTime(listing.auction.endAtUtc)}`
                              : `Updated ${formatUtcDateTime(listing.updatedAtUtc)}`}
                          </p>
                          <p>
                            {latestOrder
                              ? `Latest order ${formatOrderStatusLabel(latestOrder.status)}${latestPayment ? ` · payment ${latestPayment.status}` : ""}`
                              : "No orders or payment submissions yet."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm">
                        <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/listings/${listing.id}`}>
                          Preview
                        </Link>
                        <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/listings/${listing.id}/edit`}>
                          Edit
                        </Link>
                        {listing.status !== "draft" && listing.status !== "archived" ? (
                          <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/listings/${listing.id}`}>
                            Public page
                          </Link>
                        ) : null}
                        <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/orders?listingId=${listing.id}`}>
                          Orders
                        </Link>
                        <Link className="button-secondary px-4 py-2 text-sm font-medium" href={`/admin/payments?listingId=${listing.id}`}>
                          Payments
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {listing.status === "draft" ? (
                        <form action={`/api/admin/listings/${listing.id}/publish`} method="post">
                          <button className="button-secondary px-3 py-2 text-sm" type="submit">
                            Publish
                          </button>
                        </form>
                      ) : null}
                      {listing.status === "published" ? (
                        <form action={`/api/admin/listings/${listing.id}/unpublish`} method="post">
                          <button className="button-secondary px-3 py-2 text-sm" type="submit">
                            Unpublish
                          </button>
                        </form>
                      ) : null}
                      {listing.listingType === "auction" &&
                      listing.status === "published" &&
                      listing.auction?.status === "live" ? (
                        <form action={`/api/admin/listings/${listing.id}/close`} method="post">
                          <button className="button-secondary px-3 py-2 text-sm" type="submit">
                            End auction now
                          </button>
                        </form>
                      ) : null}
                      <form action={`/api/admin/listings/${listing.id}/duplicate`} method="post">
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Duplicate into draft
                        </button>
                      </form>
                      {listing.status !== "archived" ? (
                        <form action={archiveListingAction.bind(null, listing.id)}>
                          <button className="button-ghost px-0 py-0 text-sm font-medium text-red-700" type="submit">
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
