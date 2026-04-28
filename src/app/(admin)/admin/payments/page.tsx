import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { readStatusQueryParam } from "@/lib/catalog/service";
import { listAdminPayments } from "@/lib/payments";

type AdminPaymentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  const [allPayments, resolvedSearchParams] = await Promise.all([
    listAdminPayments(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const listingId = readStatusQueryParam(resolvedSearchParams.listingId);
  const payments = listingId
    ? allPayments.filter((payment) => payment.order.listing.id === listingId)
    : allPayments;

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            External payment submissions stay manual in V1, with approval and rejection recorded
            against the order rather than delegated to a processor.
          </p>
        }
        eyebrow="Admin"
        meta={
          <div className="metric-card">
            <span className="meta-label">Submission queue</span>
            <span className="meta-value tabular-data">{payments.length}</span>
          </div>
        }
        title="Payment review"
      />

      {listingId ? (
        <p className="notice notice-info">Filtered to one listing’s payment activity.</p>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState description="No payment submissions yet." title="No payment reviews yet" />
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <article key={payment.id} className="surface-card queue-card motion-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={payment.status} />
                    <StatusBadge label={payment.sitePaymentMethod.displayName} status="payment_submitted" />
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
                  className="button-secondary px-4 py-2 text-sm font-medium"
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
