import { listAdminRunnerUpOffers } from "@/lib/auctions";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";

export default async function AdminOffersPage() {
  const offers = await listAdminRunnerUpOffers();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Runner-up offers</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          These offers are created manually after unpaid auction outcomes. They never send
          themselves and they never relist anything automatically.
        </p>
      </section>

      {offers.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No runner-up offers yet.
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <article key={offer.id} className="rounded-md border border-zinc-200 p-5">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                  <span>{offer.status}</span>
                  <span>{offer.offeredToUser.displayName ?? offer.offeredToUser.email}</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-950">{offer.auction.listing.title}</h3>
                <div className="space-y-1 text-sm text-zinc-600">
                  <p>Offer amount {formatMoney(offer.bid.amountCents)}</p>
                  <p>Expires {formatUtcDateTime(offer.expiresAtUtc)}</p>
                  {offer.order ? <p>Created order {offer.order.id}</p> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
