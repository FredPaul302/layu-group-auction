import Link from "next/link";
import { LiveDeadline } from '@/components/ui/live-deadline';
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  formatMoney,
  formatOrderSourceLabel,
  formatOrderStatusLabel
} from "@/lib/catalog/presentation";
import { getOrderNumberLabel, listOrdersForUser } from "@/lib/orders";

function isActiveFixedPriceReservation(input: {
  source: string;
  status: string;
  listingStatus: string;
}) {
  return (
    input.source === "fixed_price_claim" &&
    input.listingStatus === "sold_pending_payment" &&
    ["awaiting_payment", "payment_submitted"].includes(input.status)
  );
}

export default async function AccountPurchasesPage() {
  const user = await requireAuthenticatedUser();
  const orders = await listOrdersForUser(user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Auction wins, buy-it-now reservations, and accepted runner-up offers stay here until
            manual payment review and fulfillment are complete. Fixed-price reservations stay held
            during the payment window, and admin approval is still what finalizes the sale.
          </p>
        }
        eyebrow="Account"
        meta={
          <div className="metric-card">
            <span className="meta-label">Active orders</span>
            <span className="meta-value tabular-data">{orders.length}</span>
          </div>
        }
        title="Purchases and wins"
      />

      {orders.length === 0 ? (
        <EmptyState description="You do not have any orders yet." title="No orders yet" />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const activeFixedPriceReservation = isActiveFixedPriceReservation({
              source: order.source,
              status: order.status,
              listingStatus: order.listing.status
            });

            return (
              <article key={order.id} className="surface-card queue-card motion-panel space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={formatOrderStatusLabel(order.status)}
                        status={order.status}
                      />
                      <StatusBadge label={formatOrderSourceLabel(order.source)} status={order.source} />
                      <StatusBadge label={getOrderNumberLabel(order.id)} status="pending" />
                    </div>
                    <h3 className="text-xl font-semibold text-zinc-950">{order.listing.title}</h3>
                    <div className="space-y-1 text-sm text-zinc-600">
                      <p>Total due {formatMoney(order.totalCents)}</p>
                      <div className="mt-2">
                        <LiveDeadline
                          at={order.paymentDeadlineAtUtc}
                          prefix={activeFixedPriceReservation ? "Reserved until" : "Pay by"}
                          completedLabel="Payment window closed"
                          warningMinutes={24 * 60}
                          urgentMinutes={60}
                          showAbsolute
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      className="button-secondary px-4 py-2 text-sm font-medium"
                      href={`/account/orders/${order.id}/payment`}
                    >
                      Payment page
                    </Link>
                    <Link
                      className="button-secondary px-4 py-2 text-sm font-medium"
                      href={`/account/fulfillment/${order.listing.id}`}
                    >
                      Fulfillment
                    </Link>
                    {order.payments[0] ? (
                      <Link
                        className="button-secondary px-4 py-2 text-sm font-medium"
                        href={`/account/payments/${order.payments[0].id}`}
                      >
                        Latest payment
                      </Link>
                    ) : null}
                  </div>
                </div>

                {order.source === "fixed_price_claim" ? (
                  <div className="notice notice-info space-y-2 text-sm">
                    {["paid", "ready_for_fulfillment", "fulfilled", "completed"].includes(order.status) ? (
                      <p>This buy-it-now reservation was finalized after a manual payment was approved.</p>
                    ) : activeFixedPriceReservation ? (
                      <>
                        <p className="font-medium">This item is reserved for this order.</p>
                        <LiveDeadline
                          at={order.paymentDeadlineAtUtc}
                          prefix="Reserved until"
                          completedLabel="Reservation window closed"
                          warningMinutes={24 * 60}
                          urgentMinutes={60}
                          showAbsolute
                        />
                        <p>Submit payment before the deadline or the listing will be released.</p>
                      </>
                    ) : (
                      <p>This reservation has been released, so the listing can be claimed again from the catalog.</p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
