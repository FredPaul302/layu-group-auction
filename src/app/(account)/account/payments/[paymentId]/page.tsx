import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { getOrderNumberLabel } from "@/lib/orders";
import { getAccountPaymentById } from "@/lib/payments";

type AccountPaymentPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export default async function AccountPaymentPage({ params }: AccountPaymentPageProps) {
  const user = await requireAuthenticatedUser();
  const { paymentId } = await params;
  const payment = await getAccountPaymentById({
    paymentId,
    userId: user.id
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">
          Payment submission {payment.id.slice(-8).toUpperCase()}
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Manual external-payment submissions stay visible here even when a payment is rejected, so
          the audit trail is never silently cleared.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Submission details</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div className="flex justify-between gap-4">
              <dt>Status</dt>
              <dd>{payment.status}</dd>
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
            {payment.reviewedAtUtc ? (
              <div className="flex justify-between gap-4">
                <dt>Reviewed at</dt>
                <dd>{formatUtcDateTime(payment.reviewedAtUtc)}</dd>
              </div>
            ) : null}
            {payment.reviewNotes ? (
              <div className="space-y-1">
                <dt className="font-medium text-zinc-900">Review notes</dt>
                <dd>{payment.reviewNotes}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Order link</h3>
          <p className="text-sm text-zinc-700">
            {payment.order.listing.title} · {getOrderNumberLabel(payment.order.id)}
          </p>
          <p className="text-sm text-zinc-600">
            Payment due {formatUtcDateTime(payment.order.paymentDeadlineAtUtc)}
          </p>
          {payment.proofAssetUrl ? (
            <a className="text-sm font-medium text-emerald-700 hover:text-emerald-800" href={payment.proofAssetUrl}>
              View uploaded proof
            </a>
          ) : null}
          <Link
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={`/account/orders/${payment.order.id}/payment`}
          >
            Back to order payment page
          </Link>
        </div>
      </section>
    </div>
  );
}
