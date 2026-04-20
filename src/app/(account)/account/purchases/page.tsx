import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import {
  formatMoney,
  formatOrderStatusLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getOrderNumberLabel, listOrdersForUser } from "@/lib/orders";

export default async function AccountPurchasesPage() {
  const user = await requireAuthenticatedUser();
  const orders = await listOrdersForUser(user.id);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Purchases and wins</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Orders from fixed-price claims, auction wins, and accepted runner-up offers stay here
          until manual payment review and fulfillment are complete.
        </p>
      </section>

      {orders.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          You do not have any orders yet.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="rounded-md border border-zinc-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                    <span>{formatOrderStatusLabel(order.status)}</span>
                    <span>{order.source}</span>
                    <span>{getOrderNumberLabel(order.id)}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-zinc-950">{order.listing.title}</h3>
                  <div className="space-y-1 text-sm text-zinc-600">
                    <p>Total due {formatMoney(order.totalCents)}</p>
                    <p>Payment due {formatUtcDateTime(order.paymentDeadlineAtUtc)}</p>
                    {order.payments.length > 0 ? <p>{order.payments.length} payment submission(s)</p> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-sm">
                  <Link
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                    href={`/account/orders/${order.id}/payment`}
                  >
                    Payment page
                  </Link>
                  <Link
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                    href={`/account/fulfillment/${order.listing.id}`}
                  >
                    Fulfillment
                  </Link>
                  {order.payments[0] ? (
                    <Link
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                      href={`/account/payments/${order.payments[0].id}`}
                    >
                      Latest payment
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
