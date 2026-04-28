import Link from "next/link";

import { PublicCatalogFilters } from "@/components/catalog/public-catalog-filters";
import { ListingCard } from "@/components/catalog/listing-card";
import { ListingSpotlight } from "@/components/catalog/listing-spotlight";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  filterAndSortPublicListings,
  getPublicCatalogCounts,
  parsePublicCatalogQuery
} from "@/lib/catalog/public-discovery";
import { listPublicListings } from "@/lib/catalog/service";

export const dynamic = "force-dynamic";

type LiveAuctionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LiveAuctionsPage({ searchParams }: LiveAuctionsPageProps) {
  const [listings, resolvedSearchParams] = await Promise.all([
    listPublicListings({
      listingType: "auction"
    }),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const query = parsePublicCatalogQuery(resolvedSearchParams, {
    type: "auction",
    status: "available",
    sort: "ending_soon"
  });
  const filteredListings = filterAndSortPublicListings(listings, {
    ...query,
    type: "auction"
  });
  const counts = getPublicCatalogCounts(listings);
  const spotlightListing = filteredListings[0] ?? null;
  const categorySummaries = Array.from(
    filteredListings
      .reduce((map, listing) => {
        const current = map.get(listing.category.slug);

        map.set(listing.category.slug, {
          slug: listing.category.slug,
          name: listing.category.name,
          count: (current?.count ?? 0) + 1
        });

        return map;
      }, new Map<string, { slug: string; name: string; count: number }>())
      .values()
  ).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Link className="button-secondary px-4 py-2 text-sm font-medium" href="/listings">
            Full catalog
          </Link>
        }
        description={
          <p>
            Focus on timed listings, sort by ending soon when urgency matters, and keep live versus closed auction states visible from the grid.
          </p>
        }
        eyebrow="Listings"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Auction listings</span>
              <span className="meta-value tabular-data">{counts.auction} public records</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Live now</span>
              <span className="meta-value tabular-data">{counts.available} active lots</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Closed / sold</span>
              <span className="meta-value tabular-data">{counts.sold + counts.closed} settled lots</span>
            </div>
          </>
        }
        title="Live auctions"
      />

      <PublicCatalogFilters
        actionPath="/listings/auctions"
        query={{ ...query, type: "auction" }}
        resultCount={filteredListings.length}
        showTypeFilter={false}
        searchPlaceholder="Search auction titles or categories"
      />

      {categorySummaries.length > 0 ? (
        <section className="collection-chip-row motion-panel motion-delay-2">
          {categorySummaries.map((category) => (
            <Link key={category.slug} className="collection-chip" href={`/categories/${category.slug}`}>
              <strong>{category.name}</strong>
              <span className="tabular-data">{category.count}</span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="collection-band motion-panel motion-delay-2">
        <div className="space-y-2">
          <p className="eyebrow">Auction feed</p>
          <h3 className="text-xl font-semibold text-zinc-950">
            Ending-soon sorting keeps real deadlines at the top of the queue.
          </h3>
        </div>
        <div className="collection-band__grid">
          <div className="collection-band__item">
            <span className="meta-label">Status</span>
            <p className="text-sm text-zinc-600">
              Live, sold, and closed auction states stay visible without changing the auction rules underneath them.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Pricing</span>
            <p className="text-sm text-zinc-600">
              Cards surface the current bid level so buyers can sort by urgency or value before opening a lot.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Navigation</span>
            <p className="text-sm text-zinc-600">
              Category chips let buyers jump laterally through the auction feed without losing discovery context.
            </p>
          </div>
        </div>
      </section>

      {filteredListings.length === 0 ? (
        <EmptyState description="Try another status or broader search." title="No auctions in this view" />
      ) : (
        <div className="space-y-8">
          {spotlightListing ? (
            <ListingSpotlight
              eyebrow="Auction spotlight"
              hrefLabel="Review auction"
              listing={spotlightListing}
              summary="Keep the deadline in view, confirm the category rules, and open the listing when it looks like the right fit."
            />
          ) : null}

          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
