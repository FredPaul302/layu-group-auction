import { ListingCard } from "@/components/catalog/listing-card";
import { listPublicListings } from "@/lib/catalog/service";

export default async function FixedPriceListingsPage() {
  const listings = await listPublicListings({
    listingType: "fixed_price"
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Listings</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Fixed-price listings</h2>
        <p className="max-w-3xl text-base text-zinc-600">
          Fixed-price inventory uses the same verification and manual external-payment model, but
          claim and purchase flows stay unavailable in this phase.
        </p>
      </section>

      {listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No fixed-price listings are published yet.
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
