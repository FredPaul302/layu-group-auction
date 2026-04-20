/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { listBidsForUser } from "@/lib/auctions";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";

export default async function AccountBidsPage() {
  const user = await requireAuthenticatedUser();
  const bids = await listBidsForUser(user.id);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">My bids</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Review your placed bids, whether you are currently winning, and any auction-win order
          that is waiting on the manual payment phase.
        </p>
      </section>

      {bids.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          You have not placed any bids yet.
        </div>
      ) : (
        <div className="space-y-4">
          {bids.map((bid) => {
            const primaryImage = bid.auction.listing.images[0] ?? null;

            return (
              <article
                key={bid.id}
                className="grid gap-4 rounded-md border border-zinc-200 p-5 md:grid-cols-[8rem_minmax(0,1fr)]"
              >
                <div>
                  {primaryImage ? (
                    <img
                      alt={primaryImage.altText ?? bid.auction.listing.title}
                      className="h-28 w-full rounded-md border border-zinc-200 object-cover"
                      src={primaryImage.publicUrl}
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-100 text-xs text-zinc-500">
                      Image pending
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                      <span>{bid.status}</span>
                      <span>{bid.auction.status}</span>
                      {bid.isWinning ? <span>Currently winning</span> : null}
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-950">
                      {bid.auction.listing.title}
                    </h3>
                    <p className="text-sm text-zinc-600">
                      Your bid {formatMoney(bid.amountCents)} | current price{" "}
                      {bid.auction.currentHighestBidCents == null
                        ? "pending"
                        : formatMoney(bid.auction.currentHighestBidCents)}
                    </p>
                  </div>

                  <dl className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-zinc-900">Placed at</dt>
                      <dd>{formatUtcDateTime(bid.placedAtUtc)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-zinc-900">Auction ends</dt>
                      <dd>{formatUtcDateTime(bid.auction.endAtUtc)}</dd>
                    </div>
                    {bid.order ? (
                      <div>
                        <dt className="font-medium text-zinc-900">Auction-win order</dt>
                        <dd>
                          {bid.order.status} until {formatUtcDateTime(bid.order.paymentDeadlineAtUtc)}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="font-medium text-zinc-900">Listing</dt>
                      <dd>{bid.auction.listing.status}</dd>
                    </div>
                  </dl>

                  <Link
                    className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
                    href={`/listings/${bid.auction.listing.id}`}
                  >
                    View listing
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
