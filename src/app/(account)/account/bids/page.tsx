/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { LiveDeadline } from '@/components/ui/live-deadline';

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listBidsForUser } from "@/lib/auctions";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";

export default async function AccountBidsPage() {
  const user = await requireAuthenticatedUser();
  const bids = await listBidsForUser(user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Review your placed bids, whether you are currently winning, and any auction-win order
            that is waiting on the manual payment phase.
          </p>
        }
        eyebrow="Account"
        meta={
          <div className="metric-card">
            <span className="meta-label">Placed bids</span>
            <span className="meta-value tabular-data">{bids.length}</span>
          </div>
        }
        title="My bids"
      />

      {bids.length === 0 ? (
        <EmptyState description="You have not placed any bids yet." title="No bids on record" />
      ) : (
        <div className="space-y-4">
          {bids.map((bid) => {
            const primaryImage = bid.auction.listing.images[0] ?? null;

            return (
              <article
                key={bid.id}
                className="surface-card queue-card motion-panel grid gap-4 p-5 md:grid-cols-[8rem_minmax(0,1fr)]"
              >
                <div>
                  <div className="media-frame h-28">
                    {primaryImage ? (
                      <img
                        alt={primaryImage.altText ?? bid.auction.listing.title}
                        className="h-full w-full object-cover"
                        src={primaryImage.publicUrl}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-zinc-100 text-xs text-zinc-500">
                        Image pending
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={bid.status} />
                      <StatusBadge status={bid.auction.status} />
                      {bid.isWinning ? <StatusBadge label="Currently winning" status="live" /> : null}
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
                    <div className="metric-card">
                      <dt className="font-medium text-zinc-900">Placed at</dt>
                      <dd>{formatUtcDateTime(bid.placedAtUtc)}</dd>
                    </div>
                    <div className="metric-card">
                      <dt className="font-medium text-zinc-900">Auction ends</dt>
                      <dd className="mt-1">
                        <LiveDeadline
                          at={bid.auction.endAtUtc}
                          prefix="Ends"
                          completedLabel="Auction ended"
                          showAbsolute
                        />
                      </dd>
                    </div>
                    {bid.order ? (
                      <div className="metric-card">
                        <dt className="font-medium text-zinc-900">Auction-win order</dt>
                        <dd>
                          {bid.order.status} until {formatUtcDateTime(bid.order.paymentDeadlineAtUtc)}
                        </dd>
                      </div>
                    ) : null}
                    <div className="metric-card">
                      <dt className="font-medium text-zinc-900">Listing</dt>
                      <dd>{bid.auction.listing.status}</dd>
                    </div>
                  </dl>

                  <Link
                    className="button-secondary px-4 py-2 text-sm font-medium"
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
