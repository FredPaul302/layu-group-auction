import { notFound } from "next/navigation";
import Link from "next/link";
import { SubmitOnceButton } from '@/components/forms/submit-once-button';
import { LiveDeadline } from '@/components/ui/live-deadline';
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  formatFulfillmentModeLabel,
  formatMoney,
  formatOrderSourceLabel,
  formatOrderStatusLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { readStatusQueryParam } from "@/lib/catalog/service";
import {
  canSubmitPaymentForOrderStatus,
  formatShippingAddress,
  getAccountOrderById,
  getOrderNumberLabel,
  isFulfillmentSelectionComplete
} from "@/lib/orders";
import { listEnabledManualPaymentMethods } from "@/lib/payments";

type AccountOrderPaymentPageProps = {
  params: Promise<{
    orderId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

function getOrderErrorMessage(code: string | null) {
  switch (code) {
    case "order_not_payable":
      return "This order is not currently accepting payment submissions.";
    case "payment_already_submitted":
      return "A payment submission is already waiting for manual review for this order.";
    case "payment_submission_invalid":
      return "Complete every payment field with a valid whole-number cent amount.";
    case "fulfillment_selection_required":
      return "Complete pickup or shipping details before submitting payment.";
    case "listing_unavailable":
      return "This fixed-price reservation is no longer active.";
    default:
      return null;
  }
}

export default async function AccountOrderPaymentPage({
  params,
  searchParams
}: AccountOrderPaymentPageProps) {
  const user = await requireAuthenticatedUser();
  const { orderId } = await params;
  const [order, paymentMethods, resolvedSearchParams] = await Promise.all([
    getAccountOrderById({
      orderId,
      userId: user.id
    }).catch(() => notFound()),
    listEnabledManualPaymentMethods(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);
  const orderNumber = getOrderNumberLabel(order.id);
  const fulfillmentReady = isFulfillmentSelectionComplete({
    selectedFulfillmentMode: order.selectedFulfillmentMode,
    pickupEventId: order.pickupEventId,
    shippingAddressText: order.shippingAddressText
  });
  const shippingAddress = formatShippingAddress(order.shippingAddressText);
  const isFixedPriceReservation = order.source === "fixed_price_claim";
  const activeFixedPriceReservation = isActiveFixedPriceReservation({
    source: order.source,
    status: order.status,
    listingStatus: order.listing.status
  });
  const reservationReleased =
    isFixedPriceReservation &&
    ["awaiting_payment", "payment_submitted", "payment_rejected", "payment_overdue"].includes(
      order.status
    ) &&
    order.listing.status !== "sold_pending_payment";
  const canSubmitPayment =
    canSubmitPaymentForOrderStatus(order.status) && fulfillmentReady && !reservationReleased;

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            {isFixedPriceReservation
              ? "Submit external payment details here after you send payment through PayPal, Venmo, or Cash App. Buy it now already reserved the item, but admin payment approval is still what finalizes the sale."
              : "Submit external payment details here after you send payment through PayPal, Venmo, or Cash App. Manual admin review is always required."}
          </p>
        }
        eyebrow="Account"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Order status</span>
              <div className="pt-1">
                <StatusBadge label={formatOrderStatusLabel(order.status)} status={order.status} />
              </div>
            </div>
            <div className="metric-card">
              <span className="meta-label">Total due</span>
              <span className="meta-value money">{formatMoney(order.totalCents)}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">
                {activeFixedPriceReservation ? "Reserved until" : "Due by"}
              </span>
              <div className="pt-1">
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
          </>
        }
        title={orderNumber}
      />

      {status === "claim_created" ? (
        <p className="notice notice-success">
          {isFixedPriceReservation
            ? "Reservation created. Send payment externally, then submit the details here before the payment window closes."
            : "Claim created. Send your payment externally, then submit the details here."}
        </p>
      ) : null}
      {status === "payment_submitted" ? (
        <p className="notice notice-success">
          Payment submission received and queued for manual review.
        </p>
      ) : null}
      {status === "runner_up_accepted" ? (
        <p className="notice notice-success">
          Runner-up offer accepted. Submit payment details before the deadline below.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-danger">
          {getOrderErrorMessage(error)}
        </p>
      ) : null}
      {reservationReleased ? (
        <p className="notice notice-danger">
          {order.status === "payment_rejected"
            ? "This reservation was released after the payment submission was rejected."
            : order.status === "payment_overdue"
              ? "This reservation expired without approved payment and has been released."
              : "This fixed-price reservation is no longer active."}
        </p>
      ) : null}
      {activeFixedPriceReservation ? (
        <div className="notice notice-info space-y-2">
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
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="surface-card fade-in panel-stack-tight p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Order details</h3>
          <dl className="data-list text-sm text-zinc-700">
            <div className="data-row">
              <dt>Listing</dt>
              <dd>{order.listing.title}</dd>
            </div>
            <div className="data-row">
              <dt>Status</dt>
              <dd>{formatOrderStatusLabel(order.status)}</dd>
            </div>
            <div className="data-row">
              <dt>Order type</dt>
              <dd>{formatOrderSourceLabel(order.source)}</dd>
            </div>
            <div className="data-row">
              <dt>Fulfillment</dt>
              <dd>
                {order.selectedFulfillmentMode
                  ? formatFulfillmentModeLabel(order.selectedFulfillmentMode)
                  : "Selection required"}
              </dd>
            </div>
            <div className="data-row">
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotalCents)}</dd>
            </div>
            <div className="data-row">
              <dt>Shipping fee</dt>
              <dd>{formatMoney(order.shippingFeeCents)}</dd>
            </div>
            <div className="data-row">
              <dt>Total due</dt>
              <dd>{formatMoney(order.totalCents)}</dd>
            </div>
            <div className="data-row">
              <dt>Payment due</dt>
              <dd className="mt-1">
                <LiveDeadline
                  at={order.paymentDeadlineAtUtc}
                  prefix="Pay by"
                  completedLabel="Payment window closed"
                  warningMinutes={24 * 60}
                  urgentMinutes={60}
                  showAbsolute
                />
              </dd>
            </div>
          </dl>

          {order.payments.length > 0 ? (
            <div className="space-y-2">
              <h4 className="meta-label">
                Submitted payments
              </h4>
              <ul className="space-y-2 text-sm text-zinc-700">
                {order.payments.map((payment) => (
                  <li key={payment.id}>
                    <Link
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                      href={`/account/payments/${payment.id}`}
                    >
                      {payment.sitePaymentMethod.displayName} · {payment.status} ·{" "}
                      {formatUtcDateTime(payment.submittedAtUtc)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {order.pickupEvent ? (
            <div className="surface-elevated space-y-2 p-4 text-sm text-zinc-700">
              <h4 className="meta-label">
                Pickup event
              </h4>
              <p className="font-medium text-zinc-950">{order.pickupEvent.name}</p>
              <p>{order.pickupEvent.locationName}</p>
              {order.pickupEvent.instructions ? <p>{order.pickupEvent.instructions}</p> : null}
            </div>
          ) : null}

          {shippingAddress ? (
            <div className="surface-elevated space-y-2 p-4 text-sm text-zinc-700">
              <h4 className="meta-label">
                Shipping address
              </h4>
              <p className="whitespace-pre-line">{shippingAddress}</p>
            </div>
          ) : null}
        </div>

        <div className="surface-card fade-in panel-stack p-6">
          <h3 className="text-lg font-semibold text-zinc-950">I sent payment</h3>
          <p className="text-sm text-zinc-600">
            Include {orderNumber} in your payment note when possible so manual review is easier.
            {isFixedPriceReservation
              ? " Reserved until the deadline shown here. Submit payment before the deadline or the listing will be released. Admin approval is still required before the sale is final."
              : ""}
          </p>

          <div className="surface-elevated space-y-2 p-4 text-sm text-zinc-700">
            <p className="font-medium text-zinc-950">
              {fulfillmentReady
                ? "Fulfillment details are on file."
                : "Fulfillment details still need to be completed before payment submission."}
            </p>
            <Link
              className="button-secondary mt-1 px-4 py-2 text-sm font-medium"
              href={`/account/fulfillment/${order.listing.id}`}
            >
              Update fulfillment details
            </Link>
          </div>

          <ul className="panel-stack-tight text-sm text-zinc-700">
            {paymentMethods.map((paymentMethod) => (
              <li key={paymentMethod.id} className="surface-elevated space-y-2 p-3">
                <p className="font-medium text-zinc-950">{paymentMethod.displayName}</p>
                {paymentMethod.handle ? <p>{paymentMethod.handle}</p> : null}
                {paymentMethod.instructions ? <p>{paymentMethod.instructions}</p> : null}
                {paymentMethod.linkUrl ? (
                  <a className="text-emerald-700 hover:text-emerald-800" href={paymentMethod.linkUrl}>
                    Open payment link
                  </a>
                ) : null}
              </li>
            ))}
          </ul>

          {isFixedPriceReservation ? (
            <p className="notice notice-info text-sm">
              This is a reserved buy-it-now order. Rejected or overdue reservations release the
              listing back into the catalog.
            </p>
          ) : null}

          {canSubmitPayment ? (
            <form
              action="/api/payments"
              className="space-y-4"
              encType="multipart/form-data"
              method="post"
            >
              <input name="orderId" type="hidden" value={order.id} />

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Payment method</span>
                <select
                  defaultValue={paymentMethods[0]?.id}
                  name="paymentMethodId"
                  required
                >
                  {paymentMethods.map((paymentMethod) => (
                    <option key={paymentMethod.id} value={paymentMethod.id}>
                      {paymentMethod.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Amount in cents</span>
                <input
                  className="tabular-data"
                  defaultValue={order.totalCents}
                  min={1}
                  name="amountCents"
                  required
                  step={1}
                  type="number"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Payer handle or name</span>
                <input name="payerHandle" required />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Payment note or external reference</span>
                <input name="externalReference" />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Optional screenshot or proof</span>
                <input accept="image/*" name="screenshot" type="file" />
              </label>

              <SubmitOnceButton
                className="button-primary px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                pendingLabel="Submitting payment..."
              >
                I sent payment
              </SubmitOnceButton>
            </form>
          ) : (
            <p className="text-sm text-zinc-600">
              {reservationReleased
                ? "This fixed-price reservation is no longer active."
                : fulfillmentReady
                ? "This order is no longer accepting new payment submissions from this page."
                : "Finish pickup or shipping details first, then return here to submit payment."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
