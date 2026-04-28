import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicCatalogFilters } from "@/components/catalog/public-catalog-filters";
import { ListingCard } from "@/components/catalog/listing-card";
import { ListingSpotlight } from "@/components/catalog/listing-spotlight";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  filterAndSortPublicListings,
  getPublicCatalogCounts,
  parsePublicCatalogQuery
} from "@/lib/catalog/public-discovery";
import { formatBidTierLabel, formatMoney } from "@/lib/catalog/presentation";
import { getPublicCategoryBySlug, listPublicListings } from "@/lib/catalog/service";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const [category, listings, resolvedSearchParams] = await Promise.all([
    getPublicCategoryBySlug(slug).catch(() => notFound()),
    listPublicListings({
      categorySlug: slug
    }),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const query = parsePublicCatalogQuery(resolvedSearchParams, {
    status: "available",
    sort: "newest"
  });
  const filteredListings = filterAndSortPublicListings(listings, query);
  const counts = getPublicCatalogCounts(listings);
  const spotlightListing = filteredListings[0] ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Link className="button-secondary px-4 py-2 text-sm font-medium" href="/listings">
            Back to listings
          </Link>
        }
        description={
          <p>
            {category.description ??
              "Browse this category with search, lifecycle filtering, and the same tier rules kept visible throughout the public flow."}
          </p>
        }
        eyebrow="Category"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Required tier</span>
              <div className="pt-1">
                <StatusBadge
                  label={formatBidTierLabel(category.requiredBidTier)}
                  status={category.requiredBidTier}
                />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Minimum start bid</span>
              <span className="meta-value money">{formatMoney(category.minimumStartBidCents)}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Minimum increment</span>
              <span className="meta-value money">
                {formatMoney(category.minimumBidIncrementCents)}
              </span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Public listings</span>
              <span className="meta-value tabular-data">{counts.total} in category</span>
            </div>
          </>
        }
        title={category.name}
      />

      <PublicCatalogFilters
        actionPath={`/categories/${category.slug}`}
        query={query}
        resultCount={filteredListings.length}
        searchPlaceholder={`Search ${category.name}`}
      />

      <section className="collection-band motion-panel motion-delay-2">
        <div className="space-y-2">
          <p className="eyebrow">Category standards</p>
          <h3 className="text-xl font-semibold text-zinc-950">
            Tier rules stay fixed while type, status, and price remain flexible for browsing.
          </h3>
        </div>
        <div className="collection-band__grid">
          <div className="collection-band__item">
            <span className="meta-label">Available now</span>
            <p className="text-sm text-zinc-600">
              {counts.available} active listing{counts.available === 1 ? "" : "s"} are currently open in this category.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Format mix</span>
            <p className="text-sm text-zinc-600">
              {counts.auction} auction listing{counts.auction === 1 ? "" : "s"} and {counts.fixed_price} fixed-price listing{counts.fixed_price === 1 ? "" : "s"} are visible here.
            </p>
          </div>
          <div className="collection-band__item">
            <span className="meta-label">Lifecycle context</span>
            <p className="text-sm text-zinc-600">
              Reserved and sold filters let buyers understand public state changes without exposing internal admin workflow.
            </p>
          </div>
        </div>
      </section>

      {filteredListings.length === 0 ? (
        <EmptyState
          description="Try another type, status, or search phrase inside this category."
          title="No listings match this category view"
        />
      ) : (
        <div className="space-y-8">
          {spotlightListing ? (
            <ListingSpotlight
              eyebrow="Category spotlight"
              hrefLabel="Open listing"
              listing={spotlightListing}
              summary={`Start with the strongest match in ${category.name}, then work outward using the category filter controls.`}
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
