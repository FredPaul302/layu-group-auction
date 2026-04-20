import Link from "next/link";

import { ListingCard } from "@/components/catalog/listing-card";
import { formatBidTierLabel, formatMoney } from "@/lib/catalog/presentation";
import { getPublicHomeData } from "@/lib/catalog/service";

export default async function HomePage() {
  const { categories, latestListings } = await getPublicHomeData();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Public catalog
        </p>
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold text-zinc-950">Browse active listings</h2>
          <p className="max-w-3xl text-base text-zinc-600">
            Auctions and fixed-price listings are now readable from the database. Bidding and
            purchase actions remain intentionally disabled while verification and commerce rules
            stay under admin control.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/listings">
            Browse all listings
          </Link>
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/listings/auctions"
          >
            Live auctions
          </Link>
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/listings/fixed-price"
          >
            Fixed-price listings
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-2xl font-semibold text-zinc-950">Categories</h3>
            <p className="text-sm text-zinc-600">
              Category tier requirements are visible, but eligibility enforcement for commerce
              stays locked until the next phase.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.id}
              className="space-y-3 rounded-md border border-zinc-200 p-5 hover:border-emerald-300"
              href={`/categories/${category.slug}`}
            >
              <div className="space-y-1">
                <h4 className="text-lg font-semibold text-zinc-950">{category.name}</h4>
                <p className="text-sm text-zinc-600">
                  {category.description ?? "No category description yet."}
                </p>
              </div>

              <dl className="grid gap-2 text-sm text-zinc-700">
                <div className="flex justify-between gap-4">
                  <dt>Required tier</dt>
                  <dd>{formatBidTierLabel(category.requiredBidTier)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Minimum start bid</dt>
                  <dd>{formatMoney(category.minimumStartBidCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Minimum increment</dt>
                  <dd>{formatMoney(category.minimumBidIncrementCents)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold text-zinc-950">Latest published listings</h3>
          <p className="text-sm text-zinc-600">
            Public listing details are live. Bid and claim actions are not available yet.
          </p>
        </div>

        {latestListings.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
            No published listings yet. Create and publish them from the admin listing screens.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {latestListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
