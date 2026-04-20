import Link from "next/link";

import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { getOrderNumberLabel } from "@/lib/orders";
import { getAdminPaymentById } from "@/lib/payments";

type AdminPaymentDetailPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPaymentDetailPage({
  params,
  searchParams
}: AdminPaymentDetailPageProps) {
  const { paymentId } = await params;
  const [payment, resolvedSearchParams] = await Promise.all([
    getAdminPaymentById(paymentId),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : null;
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">
          Payment {payment.id.slice(-8).toUpperCase()}
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Review the manual payment submission, confirm or reject it, and keep the audit trail in
          place either way.
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Submission</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div className="flex justify-between gap-4">
              <dt>Status</dt>
              <dd>{payment.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Order</dt>
              <dd>{getOrderNumberLabel(payment.order.id)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Method</dt>
              <dd>{payment.sitePaymentMethod.displayName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Amount</dt>
              <dd>{formatMoney(payment.amountCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Payer handle</dt>
              <dd>{payment.payerHandle ?? "Not provided"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Reference</dt>
              <dd>{payment.externalReference ?? "Not provided"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Submitted at</dt>
              <dd>{formatUtcDateTime(payment.submittedAtUtc)}</dd>
            </div>
          </dl>

          {payment.proofAssetUrl ? (
            <a className="text-sm font-medium text-emerald-700 hover:text-emerald-800" href={payment.proofAssetUrl}>
              View proof upload
            </a>
          ) : null}
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Review actions</h3>
          <p className="text-sm text-zinc-600">
            Confirming payment marks the order paid. Ready-for-fulfillment, fulfilled, and
            completed remain separate admin actions from the orders queue.
          </p>

          <form action={`/api/payments/${payment.id}/review`} className="space-y-4" method="post">
            <label className="space-y-2 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Review notes</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
                name="reviewNotes"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                name="decision"
                type="submit"
                value="approve"
              >
                Confirm payment
              </button>
              <button
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400"
                name="decision"
                type="submit"
                value="reject"
              >
                Reject submission
              </button>
            </div>
          </form>

          <Link
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href="/admin/orders"
          >
            Open orders queue
          </Link>
        </div>
      </section>
    </div>
  );
}
