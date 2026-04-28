/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { ListingCard } from "@/components/catalog/listing-card";
import { ListingSpotlight } from "@/components/catalog/listing-spotlight";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBidTierLabel, formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { getPublicCatalogCounts } from "@/lib/catalog/public-discovery";
import { getPublicHomeData, listPublicListings } from "@/lib/catalog/service";

function countListingsByCategory(listingIdsByCategory: Map<string, number>, categoryId: string) {
  return listingIdsByCategory.get(categoryId) ?? 0;
}

export default async function HomePage() {
  const [{ categories, latestListings }, allPublicListings] = await Promise.all([
    getPublicHomeData(),
    listPublicListings()
  ]);
  const availableListings = allPublicListings.filter((listing) => listing.status === "published");
  const liveAuctions = availableListings
    .filter((listing) => listing.listingType === "auction" && listing.auction?.status === "live")
    .sort((left, right) => {
      const leftTime = left.auction ? new Date(left.auction.endAtUtc).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.auction ? new Date(right.auction.endAtUtc).getTime() : Number.MAX_SAFE_INTEGER;

      return leftTime - rightTime;
    });
  const fixedPriceListings = availableListings.filter(
    (listing) => listing.listingType === "fixed_price"
  );
  const publicCounts = getPublicCatalogCounts(allPublicListings);
  const featuredListing =
    liveAuctions.find((listing) => listing.images.length > 0) ??
    fixedPriceListings.find((listing) => listing.images.length > 0) ??
    latestListings.find((listing) => listing.images.length > 0) ??
    availableListings.find((listing) => listing.images.length > 0) ??
    latestListings[0] ??
    availableListings[0] ??
    null;
  const featuredImage =
    featuredListing?.images.find((image) => image.isPrimary) ?? featuredListing?.images[0] ?? null;
  const endingSoon = liveAuctions.slice(0, 4);
  const fixedHighlights = fixedPriceListings.slice(0, 3);
  const newlyListed = [...availableListings]
    .sort((left, right) => {
      const leftPublished = left.publishedAtUtc ? new Date(left.publishedAtUtc).getTime() : 0;
      const rightPublished = right.publishedAtUtc ? new Date(right.publishedAtUtc).getTime() : 0;

      return rightPublished - leftPublished;
    })
    .slice(0, 4);
  const listingCountsByCategory = availableListings.reduce((counts, listing) => {
    counts.set(listing.categoryId, (counts.get(listing.categoryId) ?? 0) + 1);

    return counts;
  }, new Map<string, number>());
  const featuredCategories = categories
    .filter((category) => countListingsByCategory(listingCountsByCategory, category.id) > 0)
    .sort(
      (left, right) =>
        countListingsByCategory(listingCountsByCategory, right.id) -
        countListingsByCategory(listingCountsByCategory, left.id)
    )
    .slice(0, 6);

  return (
    <div className="space-y-12">
      <section className="public-hero motion-section motion-delay-1">
        {featuredImage ? (
          <>
            <div className="public-hero__media">
              <img
                alt={featuredImage.altText ?? featuredListing?.title ?? "Auction spotlight"}
                className="public-hero__image"
                src={featuredImage.publicUrl}
              />
            </div>
            <div className="public-hero__overlay" />
          </>
        ) : (
          <div className="public-hero__fallback" />
        )}

        <div className="public-hero__content">
          <div className="space-y-4">
            <p className="eyebrow">Single-seller auction house</p>
            <h2 className="public-hero__title">
              Browse live auctions and fixed-price inventory without losing the rules.
            </h2>
            <p className="public-hero__copy">
              The public catalog keeps type, lifecycle status, price, category access, and
              fulfillment visible from the first click. Buyers can move from ending-soon auctions
              to ready-now inventory under one consistent operating model.
            </p>
          </div>

          <div className="public-hero__actions">
            <Link className="button-primary px-4 py-2 text-sm font-medium" href="/listings">
              Browse all listings
            </Link>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href="/listings/auctions?status=available&sort=ending_soon"
            >
              Ending soon
            </Link>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href="/listings/fixed-price?status=available&sort=newest"
            >
              Fixed price
            </Link>
          </div>

          <div className="public-hero__facts">
            <p className="public-hero__fact">Live auctions close on visible deadlines.</p>
            <p className="public-hero__fact">Fixed-price listings show available, reserved, and sold states cleanly.</p>
            <p className="public-hero__fact">Verification, external payment, and manual review stay explicit.</p>
          </div>

          {featuredListing ? (
            <div className="public-hero__spotlight">
              <span className="meta-label">Current spotlight</span>
              <span className="font-medium text-zinc-950">{featuredListing.title}</span>
              <span className="text-zinc-600">
                {featuredListing.listingType === "auction" && featuredListing.auction
                  ? `Ends ${formatUtcDateTime(featuredListing.auction.endAtUtc)}`
                  : "Available now"}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="metric-grid motion-panel motion-delay-2">
        <div className="metric-card">
          <span className="meta-label">Available now</span>
          <span className="meta-value tabular-data">{publicCounts.available} listings</span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Live auctions</span>
          <span className="meta-value tabular-data">{liveAuctions.length} timed releases</span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Reserved</span>
          <span className="meta-value tabular-data">{publicCounts.reserved} pending payment</span>
        </div>
        <div className="metric-card">
          <span className="meta-label">Category access</span>
          <span className="meta-value tabular-data">{featuredCategories.length} active categories</span>
        </div>
      </section>

      <section className="space-y-6">
        <div className="public-section-heading motion-section motion-delay-2">
          <div className="space-y-2">
            <p className="eyebrow">Live now</p>
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">
              Auctions closing soonest are one click away.
            </h3>
            <p className="max-w-3xl text-sm text-zinc-600 md:text-base">
              Use the dedicated auction feed for deeper sorting, or start from the next deadlines here.
            </p>
          </div>
          <Link
            className="button-secondary px-4 py-2 text-sm font-medium"
            href="/listings/auctions?status=available&sort=ending_soon"
          >
            View ending soon
          </Link>
        </div>

        {endingSoon.length === 0 ? (
          <EmptyState
            description="No live auctions are published yet."
            title="The auction room is quiet right now"
          />
        ) : (
          <div className="space-y-6">
            <ListingSpotlight
              eyebrow="Ending sooner"
              hrefLabel="Open auction"
              listing={endingSoon[0]}
              summary="Review the listing, verify before bidding, and keep the end time in view. Highest valid bid at the close wins under the current rules."
            />

            {endingSoon.length > 1 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {endingSoon.slice(1).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="public-section-heading motion-section motion-delay-2">
          <div className="space-y-2">
            <p className="eyebrow">Fixed price</p>
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">
              Ready-now inventory stays easy to compare.
            </h3>
            <p className="max-w-3xl text-sm text-zinc-600 md:text-base">
              Buyers can jump into the fixed-price feed for newest or price sorting without losing visibility into reservation state.
            </p>
          </div>
          <Link
            className="button-secondary px-4 py-2 text-sm font-medium"
            href="/listings/fixed-price?status=available&sort=price_low"
          >
            Browse fixed price
          </Link>
        </div>

        {fixedHighlights.length === 0 ? (
          <EmptyState
            description="No fixed-price listings are published yet."
            title="No fixed-price highlights yet"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {fixedHighlights.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="public-section-heading motion-section motion-delay-2">
          <div className="space-y-2">
            <p className="eyebrow">Newly listed</p>
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">
              Fresh inventory appears here first.
            </h3>
            <p className="max-w-3xl text-sm text-zinc-600 md:text-base">
              Use newest sorting from the full catalog to continue this view with search and filters.
            </p>
          </div>
          <Link
            className="button-secondary px-4 py-2 text-sm font-medium"
            href="/listings?status=available&sort=newest"
          >
            View newest listings
          </Link>
        </div>

        {newlyListed.length === 0 ? (
          <EmptyState description="Published listings will appear here as soon as inventory goes live." title="No new listings yet" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {newlyListed.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="public-section-heading motion-section motion-delay-2">
          <div className="space-y-2">
            <p className="eyebrow">Participation standards</p>
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">
              Clear rules, concise verification, and a manual paper trail.
            </h3>
            <p className="max-w-3xl text-sm text-zinc-600 md:text-base">
              The process is intentionally narrow in V1 so buyers understand exactly how approval,
              payment, and handoff work before they commit.
            </p>
          </div>
        </div>

        <div className="trust-grid">
          <article className="trust-card surface-card motion-panel">
            <p className="eyebrow">1. Verify first</p>
            <h4 className="text-xl font-semibold text-zinc-950">Email, then Persona or deposit</h4>
            <p className="text-sm text-zinc-600">
              Everyone confirms email first. After that, buyers either complete Persona or submit a refundable deposit tier for manual review.
            </p>
            <Link className="text-emerald-700 hover:text-emerald-800" href="/help/verification">
              Verification overview
            </Link>
          </article>

          <article className="trust-card surface-card motion-panel">
            <p className="eyebrow">2. Bid or claim seriously</p>
            <h4 className="text-xl font-semibold text-zinc-950">Every action is tied to eligibility</h4>
            <p className="text-sm text-zinc-600">
              Category access follows deposit tier requirements, blocked or non-paying bidders stay restricted, and auction deadlines remain fixed once published.
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="$5 / $10 / $20 access tiers" status="tier_10" />
              <StatusBadge label="No soft close" status="ended" />
            </div>
          </article>

          <article className="trust-card surface-card motion-panel">
            <p className="eyebrow">3. Pay externally</p>
            <h4 className="text-xl font-semibold text-zinc-950">Manual confirmation stays in the loop</h4>
            <p className="text-sm text-zinc-600">
              Winners and buyers send payment through PayPal, Venmo, or Cash App, then submit the details back to the site for manual confirmation.
            </p>
            <Link className="text-emerald-700 hover:text-emerald-800" href="/help/payments">
              Payment instructions
            </Link>
          </article>

          <article className="trust-card surface-card motion-panel">
            <p className="eyebrow">4. Collect cleanly</p>
            <h4 className="text-xl font-semibold text-zinc-950">Pickup events or flat-fee shipping</h4>
            <p className="text-sm text-zinc-600">
              Listings can be pickup only, shipping only, or pickup or shipping. Pickup events support batch handoff, and shipping stays flat-fee only in V1.
            </p>
            <Link className="text-emerald-700 hover:text-emerald-800" href="/help/pickup-shipping">
              Pickup and shipping
            </Link>
          </article>
        </div>
      </section>

      <section className="space-y-6">
        <div className="public-section-heading motion-section motion-delay-2">
          <div className="space-y-2">
            <p className="eyebrow">Browse by category</p>
            <h3 className="text-2xl font-semibold text-zinc-950 md:text-3xl">
              Inventory is organized by category rules, not guesswork.
            </h3>
            <p className="max-w-3xl text-sm text-zinc-600 md:text-base">
              Required bidding tiers, minimum start bids, and increment rules stay visible at the category level so the catalog is easy to read before anyone commits.
            </p>
          </div>
        </div>

        {featuredCategories.length === 0 ? (
          <EmptyState
            description="No category inventory is ready to browse yet."
            title="Categories will appear as listings are published"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredCategories.map((category) => (
              <Link
                key={category.id}
                className="surface-card surface-card-hover motion-panel space-y-4 p-5"
                href={`/categories/${category.slug}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge
                    label={formatBidTierLabel(category.requiredBidTier)}
                    status={category.requiredBidTier}
                  />
                  <span className="meta-label tabular-data">
                    {countListingsByCategory(listingCountsByCategory, category.id)} live
                  </span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-lg font-semibold text-zinc-950">{category.name}</h4>
                  <p className="text-sm text-zinc-600">
                    {category.description ?? "No category description yet."}
                  </p>
                </div>

                <dl className="data-list text-sm text-zinc-700">
                  <div className="data-row">
                    <dt>Minimum start bid</dt>
                    <dd>{formatMoney(category.minimumStartBidCents)}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Minimum increment</dt>
                    <dd>{formatMoney(category.minimumBidIncrementCents)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
