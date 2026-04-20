import Link from "next/link";

import { ListingCard } from "@/components/catalog/listing-card";
import { listPublicListings } from "@/lib/catalog/service";

export default async function ListingsPage() {
  const listings = await listPublicListings();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Listings</p>
        <h2 className="text-3xl font-semibold text-zinc-950">All published listings</h2>
        <p className="max-w-3xl text-base text-zinc-600">
          Browse every published auction and fixed-price listing. This catalog is read-only for
          now while verification gates and commerce actions remain disabled.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/listings/auctions">
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

      {listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No published listings yet.
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </section>
      )}
    </div>
  );
}
