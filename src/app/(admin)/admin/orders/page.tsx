import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { LiveDeadline } from "@/components/ui/live-deadline";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatFulfillmentModeLabel,
  formatMoney,
  formatOrderSourceLabel,
  formatOrderStatusLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { readStatusQueryParam } from "@/lib/catalog/service";
import {
  formatShippingAddress,
  getOrderNumberLabel,
  isFulfillmentSelectionComplete,
  listAdminOrders
} from "@/lib/orders";

type AdminOrdersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatStatusText(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

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

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const [allOrders, resolvedSearchParams] = await Promise.all([
    listAdminOrders(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);
  const listingId = readStatusQueryParam(resolvedSearchParams.listingId);
  const orders = listingId
    ? allOrders.filter((order) => order.listing.id === listingId)
    : allOrders;

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Auction wins, buy-it-now reservations, manual payment review, runner-up offers,
            fulfillment, relisting, and cancellation all flow through this operational view.
          </p>
        }
        eyebrow="Admin"
        meta={
          <div className="metric-card">
            <span className="meta-label">Tracked orders</span>
            <span className="meta-value tabular-data">{orders.length}</span>
          </div>
        }
        title="Orders"
      />

      {listingId ? (
        <p className="notice notice-info">Filtered to one listing’s order history.</p>
      ) : null}

      {status ? (
        <p className="notice notice-success">
          {status.replaceAll("_", " ")}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-danger">
          {error.replaceAll("_", " ")}
        </p>
      ) : null}

      <div className="space-y-4">
        {orders.length === 0 ? (
          <EmptyState description="No orders yet." title="No orders to review" />
        ) : (
          orders.map((order) => {
            const fulfillmentReady = isFulfillmentSelectionComplete({
              selectedFulfillmentMode: order.selectedFulfillmentMode,
              pickupEventId: order.pickupEventId,
              shippingAddressText: order.shippingAddressText
            });
            const activeFixedPriceReservation = isActiveFixedPriceReservation({
              source: order.source,
              status: order.status,
              listingStatus: order.listing.status
            });
            const pendingReviewPayment =
              order.payments.find((payment) => payment.status === "pending_review") ?? null;
            const latestPayment = order.payments[0] ?? null;
            const paymentReviewTarget = pendingReviewPayment ?? latestPayment;

            return (
              <article key={order.id} className="surface-card queue-card motion-panel p-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          label={formatOrderStatusLabel(order.status)}
                          status={order.status}
                        />
                        <StatusBadge label={formatOrderSourceLabel(order.source)} status={order.source} />
                        <StatusBadge label={`Listing ${formatStatusText(order.listing.status)}`} status={order.listing.status} />
                        <StatusBadge label={getOrderNumberLabel(order.id)} status="pending" />
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-950">{order.listing.title}</h3>
                      <div className="space-y-1 text-sm text-zinc-600">
                        <p>
                          Buyer {order.buyerUser.displayName ?? order.buyerUser.email} · total{" "}
                          {formatMoney(order.totalCents)}
                        </p>
                        <div>
                          <LiveDeadline
                            at={order.paymentDeadlineAtUtc}
                            prefix={activeFixedPriceReservation ? "Reserved until" : "Payment due"}
                            completedLabel="Payment window closed"
                            warningMinutes={24 * 60}
                            urgentMinutes={60}
                            showAbsolute
                          />
                        </div>
                        <p>
                          {pendingReviewPayment
                            ? `Payment submitted via ${pendingReviewPayment.sitePaymentMethod.displayName} and waiting for review.`
                            : latestPayment
                              ? `Latest payment ${formatStatusText(latestPayment.status)} via ${latestPayment.sitePaymentMethod.displayName}.`
                              : "No payment has been submitted yet."}
                        </p>
                        <p>
                          Fulfillment{" "}
                          {order.selectedFulfillmentMode
                            ? formatFulfillmentModeLabel(order.selectedFulfillmentMode)
                            : "selection required"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                      <Link
                        className="button-secondary px-4 py-2 text-sm font-medium"
                        href={`/listings/${order.listing.id}`}
                      >
                        Listing
                      </Link>
                      {paymentReviewTarget ? (
                        <Link
                          className="button-secondary px-4 py-2 text-sm font-medium"
                          href={`/admin/payments/${paymentReviewTarget.id}`}
                        >
                          {pendingReviewPayment ? "Review payment" : "Latest payment"}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {["awaiting_payment", "payment_submitted", "payment_rejected", "payment_overdue"].includes(
                      order.status
                    ) && order.source !== "fixed_price_claim" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_paid" />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Mark paid
                        </button>
                      </form>
                    ) : null}

                    {order.status === "paid" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_ready_for_fulfillment" />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Ready for fulfillment
                        </button>
                      </form>
                    ) : null}

                    {order.status === "ready_for_fulfillment" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_fulfilled" />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Mark fulfilled
                        </button>
                      </form>
                    ) : null}

                    {order.status === "fulfilled" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_completed" />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Mark completed
                        </button>
                      </form>
                    ) : null}

                    {["awaiting_payment", "payment_submitted", "payment_rejected", "payment_overdue", "paid", "ready_for_fulfillment"].includes(
                      order.status
                    ) ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_cancelled" />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Cancel order
                        </button>
                      </form>
                    ) : null}

                    {order.source === "auction_win" &&
                    (order.status === "payment_overdue" || order.status === "cancelled") ? (
                      <form action={`/api/admin/listings/${order.listing.id}/runner-up-offer`} method="post">
                        <input name="orderId" type="hidden" value={order.id} />
                        <button className="button-secondary px-3 py-2 text-sm" type="submit">
                          Offer to runner-up
                        </button>
                      </form>
                    ) : null}

                    <form action={`/api/admin/listings/${order.listing.id}/relist`} method="post">
                      <input name="mode" type="hidden" value="same_settings" />
                      <button className="button-secondary px-3 py-2 text-sm" type="submit">
                        Relist same settings
                      </button>
                    </form>
                    <form action={`/api/admin/listings/${order.listing.id}/relist`} method="post">
                      <input name="mode" type="hidden" value="edit" />
                      <button className="button-secondary px-3 py-2 text-sm" type="submit">
                        Relist and edit
                      </button>
                    </form>
                    <form action={`/api/admin/listings/${order.listing.id}/archive`} method="post">
                      <button className="button-secondary px-3 py-2 text-sm" type="submit">
                        Archive item
                      </button>
                    </form>
                  </div>

                  <div className="surface-elevated p-4 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-950">Fulfillment details</p>
                    {order.source === "fixed_price_claim" ? (
                      <>
                        <p>
                          This is a fixed-price reservation. The listing should stay reserved while
                          payment is due or under review, and only an approved payment should move it
                          into a paid state.
                        </p>
                        {activeFixedPriceReservation ? (
                          <p className="font-medium">
                            Reserved until {formatUtcDateTime(order.paymentDeadlineAtUtc)}.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    <p>
                      {fulfillmentReady
                        ? "Fulfillment selection complete."
                        : "Fulfillment selection still missing required details."}
                    </p>
                    {order.pickupEvent ? (
                      <p>
                        Pickup event: {order.pickupEvent.name} ·{" "}
                        {formatUtcDateTime(order.pickupEvent.startAtUtc)}
                      </p>
                    ) : null}
                    {order.shippingAddressText ? (
                      <p className="whitespace-pre-line">{formatShippingAddress(order.shippingAddressText)}</p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
