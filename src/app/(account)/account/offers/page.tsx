import Link from "next/link";

import { listRunnerUpOffersForUser } from "@/lib/auctions";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";

export default async function AccountOffersPage() {
  const user = await requireAuthenticatedUser();
  const offers = await listRunnerUpOffersForUser(user.id);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Runner-up offers</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Manual second-chance offers stay here until you accept, decline, or the offer expires.
        </p>
      </section>

      {offers.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          You do not have any runner-up offers right now.
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <article key={offer.id} className="rounded-md border border-zinc-200 p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                  <span>{offer.status}</span>
                  <span>{offer.bid.amountCents} cents</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-950">{offer.auction.listing.title}</h3>
                <p className="text-sm text-zinc-600">
                  Offer amount {formatMoney(offer.bid.amountCents)} · expires{" "}
                  {formatUtcDateTime(offer.expiresAtUtc)}
                </p>

                <div className="flex flex-wrap gap-3">
                  {offer.status === "pending" ? (
                    <>
                      <form action={`/api/offers/${offer.id}/respond`} method="post">
                        <input name="decision" type="hidden" value="accept" />
                        <button
                          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                          type="submit"
                        >
                          Accept offer
                        </button>
                      </form>
                      <form action={`/api/offers/${offer.id}/respond`} method="post">
                        <input name="decision" type="hidden" value="decline" />
                        <button
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400"
                          type="submit"
                        >
                          Decline
                        </button>
                      </form>
                    </>
                  ) : null}

                  {offer.order ? (
                    <Link
                      className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
                      href={`/account/orders/${offer.order.id}/payment`}
                    >
                      Open order
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
