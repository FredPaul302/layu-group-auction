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

type FixedPriceListingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FixedPriceListingsPage({
  searchParams
}: FixedPriceListingsPageProps) {
  const [listings, resolvedSearchParams] = await Promise.all([
    listPublicListings({
      listingType: "fixed_price"
    }),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const query = parsePublicCatalogQuery(resolvedSearchParams, {
    type: "fixed_price",
    status: "available",
    sort: "newest"
  });
  const filteredListings = filterAndSortPublicListings(listings, {
    ...query,
    type: "fixed_price"
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
            Browse ready-now inventory with search, price sorting, and lifecycle visibility that makes reservations and sold states easy to distinguish.
          </p>
        }
        eyebrow="Listings"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Fixed-price listings</span>
              <span className="meta-value tabular-data">{counts.fixed_price} public records</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Available now</span>
              <span className="meta-value tabular-data">{counts.available} ready to reserve</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Reserved / sold</span>
              <span className="meta-value tabular-data">{counts.reserved + counts.sold} lifecycle states</span>
            </div>
          </>
        }
        title="Fixed-price listings"
      />

      <PublicCatalogFilters
        actionPath="/listings/fixed-price"
        query={{ ...query, type: "fixed_price" }}
        resultCount={filteredListings.length}
        showTypeFilter={false}
        searchPlaceholder="Search fixed-price titles or categories"
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
          <p className="eyebrow">Fixed-price feed</p>
          <h3 className="text-xl font-semibold text-zinc-950">
            Newest and price sorting keep the ready-now catalog practical.
          </h3>
        </div>
        <div className="collection-band__grid">
          <div className="collection-band__item">
            <span className="meta-label">Available</span>
            <p className="text-sm text-zinc-600">
              Buyers can separate active inventory from reserved or sold items without leaving the page.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Reservation visibility</span>
            <p className="text-sm text-zinc-600">
              Reserved cards stay visible as a public lifecycle state while payment review is still pending.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Category scan</span>
            <p className="text-sm text-zinc-600">
              Search and category chips make it easier to spot similar inventory without bouncing through admin-created slugs manually.
            </p>
          </div>
        </div>
      </section>

      {filteredListings.length === 0 ? (
        <EmptyState
          description="Try a broader search, another price sort, or a different lifecycle filter."
          title="No fixed-price listings in this view"
        />
      ) : (
        <div className="space-y-8">
          {spotlightListing ? (
            <ListingSpotlight
              eyebrow="Fixed-price spotlight"
              hrefLabel="Review listing"
              listing={spotlightListing}
              summary="Start with the strongest match, then use lifecycle status and price sorting to keep the rest of the inventory organized."
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
