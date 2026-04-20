import Link from "next/link";

import { archiveListingAction } from "@/lib/catalog/actions";
import {
  formatListingPriceLabel,
  formatListingTypeLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { listAdminListings, readStatusQueryParam } from "@/lib/catalog/service";

type AdminListingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {message}
    </div>
  );
}

export default async function AdminListingsPage({
  searchParams
}: AdminListingsPageProps) {
  const resolvedSearchParamsPromise =
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>);
  const [listings, resolvedSearchParams] = await Promise.all([
    listAdminListings(),
    resolvedSearchParamsPromise
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-semibold text-zinc-950">Listings</h2>
            <p className="max-w-3xl text-base text-zinc-600">
              Create, edit, publish, and archive listings without enabling bidding or purchase
              actions. Auction listings start immediately when published.
            </p>
          </div>

          <Link
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            href="/admin/listings/new"
          >
            Create listing
          </Link>
        </div>
      </section>

      {status === "listing_archived" ? (
        <Feedback message="Listing archived." tone="success" />
      ) : null}

      <section className="space-y-4">
        {listings.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
            No listings have been created yet.
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((listing) => (
              <article key={listing.id} className="rounded-md border border-zinc-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                      <span>{listing.status}</span>
                      <span>{formatListingTypeLabel(listing.listingType)}</span>
                      <span>{listing.category.name}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-zinc-950">{listing.title}</h3>
                    <div className="space-y-1 text-sm text-zinc-600">
                      <p>
                        {formatListingPriceLabel({
                          listingType: listing.listingType,
                          fixedPriceCents: listing.fixedPriceCents,
                          startingBidCents: listing.auction?.startingBidCents ?? null
                        })}
                      </p>
                      {listing.auction ? <p>Ends {formatUtcDateTime(listing.auction.endAtUtc)}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                      href={`/admin/listings/${listing.id}`}
                    >
                      View
                    </Link>
                    <Link
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                      href={`/admin/listings/${listing.id}/edit`}
                    >
                      Edit
                    </Link>
                    {listing.status !== "archived" ? (
                      <form action={archiveListingAction.bind(null, listing.id)}>
                        <button
                          className="font-medium text-red-700 hover:text-red-800"
                          type="submit"
                        >
                          Archive
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
