import Link from "next/link";

import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { listAdminPayments } from "@/lib/payments";

export default async function AdminPaymentsPage() {
  const payments = await listAdminPayments();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Payment review</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          External payment submissions stay manual in V1, with approval and rejection recorded
          against the order rather than delegated to a processor.
        </p>
      </section>

      {payments.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No payment submissions yet.
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <article key={payment.id} className="rounded-md border border-zinc-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-zinc-500">
                    <span>{payment.status}</span>
                    <span>{payment.sitePaymentMethod.displayName}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-zinc-950">{payment.order.listing.title}</h3>
                  <div className="space-y-1 text-sm text-zinc-600">
                    <p>
                      Buyer {payment.order.buyerUser.displayName ?? payment.order.buyerUser.email}
                    </p>
                    <p>
                      {formatMoney(payment.amountCents)} submitted{" "}
                      {formatUtcDateTime(payment.submittedAtUtc)}
                    </p>
                  </div>
                </div>

                <Link
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  href={`/admin/payments/${payment.id}`}
                >
                  Review payment
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
