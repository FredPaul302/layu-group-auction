import Link from "next/link";

import { LiveDeadline } from "@/components/ui/live-deadline";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatMoney,
  formatOrderStatusLabel,
  formatOrderSourceLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getOrderNumberLabel } from "@/lib/orders";
import { getAdminPaymentById } from "@/lib/payments";

type AdminPaymentDetailPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
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

function getPaymentReviewErrorMessage(code: string | null) {
  switch (code) {
    case "listing_unavailable":
      return "This fixed-price reservation is no longer active, so this submission can no longer finalize the sale.";
    case "payment_review_invalid":
      return "This payment submission can no longer be reviewed in its current state.";
    default:
      return code ? code.replaceAll("_", " ") : null;
  }
}

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
  const activeFixedPriceReservation = isActiveFixedPriceReservation({
    source: payment.order.source,
    status: payment.order.status,
    listingStatus: payment.order.listing.status
  });

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Review the manual payment submission, confirm or reject it, and keep the audit trail in
            place either way.
          </p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Review status</span>
              <div className="pt-1">
                <StatusBadge status={payment.status} />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Amount</span>
              <span className="meta-value money">{formatMoney(payment.amountCents)}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Method</span>
              <span className="meta-value">{payment.sitePaymentMethod.displayName}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">
                {activeFixedPriceReservation ? "Reserved until" : "Payment due"}
              </span>
              <div className="pt-1">
                <LiveDeadline
                  at={payment.order.paymentDeadlineAtUtc}
                  prefix={activeFixedPriceReservation ? "Reserved until" : "Payment due"}
                  completedLabel="Payment window closed"
                  warningMinutes={24 * 60}
                  urgentMinutes={60}
                  showAbsolute
                />
              </div>
            </div>
          </>
        }
        title={`Payment ${payment.id.slice(-8).toUpperCase()}`}
      />

      {status ? (
        <p className="notice notice-success">
          {status.replaceAll("_", " ")}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-danger">
          {getPaymentReviewErrorMessage(error)}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="panel-stack">
          <div className="surface-card fade-in panel-stack-tight p-6">
            <h3 className="text-lg font-semibold text-zinc-950">Order and reservation</h3>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={formatOrderSourceLabel(payment.order.source)} status={payment.order.source} />
              <StatusBadge label={formatOrderStatusLabel(payment.order.status)} status={payment.order.status} />
              <StatusBadge
                label={`Listing ${formatStatusText(payment.order.listing.status)}`}
                status={payment.order.listing.status}
              />
            </div>
            <dl className="data-list text-sm text-zinc-700">
              <div className="data-row">
                <dt>Listing title</dt>
                <dd>{payment.order.listing.title}</dd>
              </div>
              <div className="data-row">
                <dt>Buyer</dt>
                <dd>{payment.order.buyerUser.displayName ?? payment.order.buyerUser.email}</dd>
              </div>
              <div className="data-row">
                <dt>Buyer email</dt>
                <dd>{payment.order.buyerUser.email}</dd>
              </div>
              <div className="data-row">
                <dt>Order number</dt>
                <dd>{getOrderNumberLabel(payment.order.id)}</dd>
              </div>
              <div className="data-row">
                <dt>{activeFixedPriceReservation ? "Reservation deadline" : "Payment deadline"}</dt>
                <dd className="mt-1">
                  <LiveDeadline
                    at={payment.order.paymentDeadlineAtUtc}
                    prefix={activeFixedPriceReservation ? "Reserved until" : "Payment due"}
                    completedLabel="Payment window closed"
                    warningMinutes={24 * 60}
                    urgentMinutes={60}
                    showAbsolute
                  />
                </dd>
              </div>
              <div className="data-row">
                <dt>Total due</dt>
                <dd>{formatMoney(payment.order.totalCents)}</dd>
              </div>
            </dl>

            {payment.order.source === "fixed_price_claim" ? (
              <p className="notice notice-info text-sm">
                {activeFixedPriceReservation
                  ? "This listing is still reserved. Approval can finalize the sale while the reservation remains active."
                  : "This fixed-price reservation is no longer active on the listing."}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="button-secondary px-4 py-2 text-sm font-medium"
                href={`/listings/${payment.order.listing.id}`}
              >
                Open listing
              </Link>
              <Link
                className="button-secondary px-4 py-2 text-sm font-medium"
                href="/admin/orders"
              >
                Open orders queue
              </Link>
            </div>
          </div>

          <div className="surface-card fade-in panel-stack-tight p-6">
            <h3 className="text-lg font-semibold text-zinc-950">Submitted payment</h3>
            <dl className="data-list text-sm text-zinc-700">
              <div className="data-row">
                <dt>Review status</dt>
                <dd>{formatStatusText(payment.status)}</dd>
              </div>
              <div className="data-row">
                <dt>Method</dt>
                <dd>{payment.sitePaymentMethod.displayName}</dd>
              </div>
              <div className="data-row">
                <dt>Amount</dt>
                <dd>{formatMoney(payment.amountCents)}</dd>
              </div>
              <div className="data-row">
                <dt>Payer handle</dt>
                <dd>{payment.payerHandle ?? "Not provided"}</dd>
              </div>
              <div className="data-row">
                <dt>Reference</dt>
                <dd>{payment.externalReference ?? "Not provided"}</dd>
              </div>
              <div className="data-row">
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
        </div>

        <div className="surface-card fade-in panel-stack p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Review actions</h3>
          <p className="text-sm text-zinc-600">
            Confirming payment marks the order paid. Ready-for-fulfillment, fulfilled, and
            completed remain separate admin actions from the orders queue.
          </p>
          {payment.order.source === "fixed_price_claim" ? (
            <p className="notice notice-info text-sm">
              This is a fixed-price reservation. Payment approval finalizes the sale only while the
              reservation is still active on the listing.
            </p>
          ) : null}

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
                className="button-primary px-4 py-2 text-sm font-medium"
                name="decision"
                type="submit"
                value="approve"
              >
                Confirm payment
              </button>
              <button
                className="button-secondary px-4 py-2 text-sm font-medium"
                name="decision"
                type="submit"
                value="reject"
              >
                Reject submission
              </button>
            </div>
          </form>

          <Link
            className="button-secondary px-4 py-2 text-sm font-medium"
            href="/admin/orders"
          >
            Open orders queue
          </Link>
        </div>
      </section>
    </div>
  );
}
