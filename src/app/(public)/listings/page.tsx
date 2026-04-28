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

type ListingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const [listings, resolvedSearchParams] = await Promise.all([
    listPublicListings(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const query = parsePublicCatalogQuery(resolvedSearchParams, {
    status: "available",
    sort: "newest"
  });
  const filteredListings = filterAndSortPublicListings(listings, query);
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
          <>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href="/listings/auctions"
            >
              Live auctions
            </Link>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href="/listings/fixed-price"
            >
              Fixed price
            </Link>
          </>
        }
        description={
          <p>
            Search the public catalog by title or category, pivot between auctions and fixed-price
            listings, and keep status visible before you open an individual listing.
          </p>
        }
        eyebrow="Listings"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Public catalog</span>
              <span className="meta-value tabular-data">{counts.total} listings</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Available now</span>
              <span className="meta-value tabular-data">{counts.available} active</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Reserved</span>
              <span className="meta-value tabular-data">{counts.reserved} pending</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Sold / closed</span>
              <span className="meta-value tabular-data">{counts.sold + counts.closed} historical</span>
            </div>
          </>
        }
        title="Browse the catalog"
      />

      <PublicCatalogFilters
        actionPath="/listings"
        query={query}
        resultCount={filteredListings.length}
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
          <p className="eyebrow">Discovery guide</p>
          <h3 className="text-xl font-semibold text-zinc-950">
            Start with active inventory, then open reserved or closed states when you need context.
          </h3>
        </div>
        <div className="collection-band__grid">
          <div className="collection-band__item">
            <span className="meta-label">Auctions</span>
            <p className="text-sm text-zinc-600">
              Use ending-soon sorting to surface live lots that need attention first.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Fixed price</span>
            <p className="text-sm text-zinc-600">
              Newest and price sorting make the ready-now inventory easier to scan quickly.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Status</span>
            <p className="text-sm text-zinc-600">
              Reserved and sold filters keep public lifecycle states visible without exposing admin-only operations.
            </p>
          </div>
        </div>
      </section>

      {filteredListings.length === 0 ? (
        <EmptyState
          description="Try a broader search, another status, or switch between auctions and fixed price."
          title="No listings match this view"
        />
      ) : (
        <div className="space-y-8">
          {spotlightListing ? (
            <ListingSpotlight
              eyebrow="Catalog spotlight"
              hrefLabel="Open listing"
              listing={spotlightListing}
              summary="Use the current filters to narrow the field, then open the strongest match to review deadline, fulfillment, and participation details."
            />
          ) : null}

          <section className="space-y-6">
            <div className="public-section-heading">
              <div className="space-y-2">
                <p className="eyebrow">Results</p>
                <h3 className="text-2xl font-semibold text-zinc-950">
                  Matching public listings
                </h3>
                <p className="max-w-3xl text-sm text-zinc-600">
                  Type, lifecycle status, price, and auction deadline stay visible directly on the card.
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
