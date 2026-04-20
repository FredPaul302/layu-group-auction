import { ListingCard } from "@/components/catalog/listing-card";
import { listPublicListings } from "@/lib/catalog/service";

export default async function LiveAuctionsPage() {
  const listings = await listPublicListings({
    listingType: "auction"
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Listings</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Live auctions</h2>
        <p className="max-w-3xl text-base text-zinc-600">
          Published auction listings start immediately when published. The catalog shows the
          starting bid placeholder only; bidding itself remains disabled in this step.
        </p>
      </section>

      {listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No live auctions are published yet.
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
