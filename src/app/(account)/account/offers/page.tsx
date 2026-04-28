import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listRunnerUpOffersForUser } from "@/lib/auctions";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";

type AccountOffersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getOfferErrorMessage(code: string | null) {
  switch (code) {
    case "secondary_verification_required":
      return "Complete current verification before accepting this runner-up offer.";
    case "tier_access_required":
      return "Your approved tier does not allow this runner-up offer.";
    case "order_status_invalid":
      return "That offer is no longer pending. Refresh to see its latest status.";
    default:
      return null;
  }
}

export default async function AccountOffersPage({ searchParams }: AccountOffersPageProps) {
  const user = await requireAuthenticatedUser();
  const [offers, resolvedSearchParams] = await Promise.all([
    listRunnerUpOffersForUser(user.id),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readValue(resolvedSearchParams.status);
  const error = readValue(resolvedSearchParams.error);
  const errorMessage = getOfferErrorMessage(error);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>Manual second-chance offers stay here until you accept, decline, or the offer expires.</p>
        }
        eyebrow="Account"
        meta={
          <div className="metric-card">
            <span className="meta-label">Open offers</span>
            <span className="meta-value tabular-data">{offers.length}</span>
          </div>
        }
        title="Runner-up offers"
      />

      {status === "runner_up_declined" ? (
        <p className="notice notice-success">Runner-up offer declined.</p>
      ) : null}
      {errorMessage ? (
        <p className="notice notice-danger">{errorMessage}</p>
      ) : null}

      {offers.length === 0 ? (
        <EmptyState
          description="You do not have any runner-up offers right now."
          title="No second-chance offers"
        />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <article key={offer.id} className="surface-card queue-card motion-panel space-y-4 p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={offer.status} />
                  <StatusBadge label="Runner-up bid" status="payment_submitted" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-950">{offer.auction.listing.title}</h3>
                <p className="money text-sm text-zinc-600">
                  Offer amount {formatMoney(offer.bid.amountCents)} · expires{" "}
                  {formatUtcDateTime(offer.expiresAtUtc)}
                </p>

                <div className="flex flex-wrap gap-3">
                  {offer.status === "pending" ? (
                    <>
                      <form action={`/api/offers/${offer.id}/respond`} method="post">
                        <input name="decision" type="hidden" value="accept" />
                        <button
                          className="button-primary px-4 py-2 text-sm font-medium"
                          type="submit"
                        >
                          Accept offer
                        </button>
                      </form>
                      <form action={`/api/offers/${offer.id}/respond`} method="post">
                        <input name="decision" type="hidden" value="decline" />
                        <button
                          className="button-secondary px-4 py-2 text-sm font-medium"
                          type="submit"
                        >
                          Decline
                        </button>
                      </form>
                    </>
                  ) : null}

                  {offer.order ? (
                    <Link
                      className="button-secondary px-4 py-2 text-sm font-medium"
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
