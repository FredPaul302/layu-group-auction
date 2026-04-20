import Link from "next/link";

import {
  formatFulfillmentModeLabel,
  formatMoney,
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

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const [orders, resolvedSearchParams] = await Promise.all([
    listAdminOrders(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Orders</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Auction wins, fixed-price claims, manual payment review, runner-up offers, fulfillment,
          relisting, and cancellation all flow through this operational view.
        </p>
      </section>

      {status ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {status.replaceAll("_", " ")}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.replaceAll("_", " ")}
        </p>
      ) : null}

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
            No orders yet.
          </div>
        ) : (
          orders.map((order) => {
            const fulfillmentReady = isFulfillmentSelectionComplete({
              selectedFulfillmentMode: order.selectedFulfillmentMode,
              pickupEventId: order.pickupEventId,
              shippingAddressText: order.shippingAddressText
            });

            return (
              <article key={order.id} className="rounded-md border border-zinc-200 p-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                        <span>{formatOrderStatusLabel(order.status)}</span>
                        <span>{order.source}</span>
                        <span>{getOrderNumberLabel(order.id)}</span>
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-950">{order.listing.title}</h3>
                      <div className="space-y-1 text-sm text-zinc-600">
                        <p>
                          Buyer {order.buyerUser.displayName ?? order.buyerUser.email} · total{" "}
                          {formatMoney(order.totalCents)}
                        </p>
                        <p>Due {formatUtcDateTime(order.paymentDeadlineAtUtc)}</p>
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
                        className="font-medium text-emerald-700 hover:text-emerald-800"
                        href={`/listings/${order.listing.id}`}
                      >
                        Listing
                      </Link>
                      {order.payments[0] ? (
                        <Link
                          className="font-medium text-emerald-700 hover:text-emerald-800"
                          href={`/admin/payments/${order.payments[0].id}`}
                        >
                          Latest payment
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {["awaiting_payment", "payment_submitted", "payment_rejected", "payment_overdue"].includes(
                      order.status
                    ) ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_paid" />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Mark paid
                        </button>
                      </form>
                    ) : null}

                    {order.status === "paid" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_ready_for_fulfillment" />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Ready for fulfillment
                        </button>
                      </form>
                    ) : null}

                    {order.status === "ready_for_fulfillment" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_fulfilled" />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Mark fulfilled
                        </button>
                      </form>
                    ) : null}

                    {order.status === "fulfilled" ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_completed" />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Mark completed
                        </button>
                      </form>
                    ) : null}

                    {["awaiting_payment", "payment_submitted", "payment_rejected", "payment_overdue", "paid", "ready_for_fulfillment"].includes(
                      order.status
                    ) ? (
                      <form action={`/api/admin/orders/${order.id}/status`} method="post">
                        <input name="action" type="hidden" value="mark_cancelled" />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Cancel order
                        </button>
                      </form>
                    ) : null}

                    {order.source === "auction_win" &&
                    (order.status === "payment_overdue" || order.status === "cancelled") ? (
                      <form action={`/api/admin/listings/${order.listing.id}/runner-up-offer`} method="post">
                        <input name="orderId" type="hidden" value={order.id} />
                        <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                          Offer to runner-up
                        </button>
                      </form>
                    ) : null}

                    <form action={`/api/admin/listings/${order.listing.id}/relist`} method="post">
                      <input name="mode" type="hidden" value="same_settings" />
                      <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                        Relist same settings
                      </button>
                    </form>
                    <form action={`/api/admin/listings/${order.listing.id}/relist`} method="post">
                      <input name="mode" type="hidden" value="edit" />
                      <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                        Relist and edit
                      </button>
                    </form>
                    <form action={`/api/admin/listings/${order.listing.id}/archive`} method="post">
                      <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm" type="submit">
                        Archive item
                      </button>
                    </form>
                  </div>

                  <div className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-950">Fulfillment details</p>
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
