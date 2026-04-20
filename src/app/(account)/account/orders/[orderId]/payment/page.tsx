import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import {
  formatFulfillmentModeLabel,
  formatMoney,
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

function getOrderErrorMessage(code: string | null) {
  switch (code) {
    case "order_not_payable":
      return "This order is not currently accepting payment submissions.";
    case "payment_submission_invalid":
      return "Complete every payment field with a valid whole-number cent amount.";
    case "fulfillment_selection_required":
      return "Complete pickup or shipping details before submitting payment.";
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
    }),
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

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">{orderNumber}</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Submit external payment details here after you send payment through PayPal, Venmo, or
          Cash App. Manual admin review is always required.
        </p>
      </section>

      {status === "claim_created" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Claim created. Send your payment externally, then submit the details here.
        </p>
      ) : null}
      {status === "payment_submitted" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Payment submission received and queued for manual review.
        </p>
      ) : null}
      {status === "runner_up_accepted" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Runner-up offer accepted. Submit payment details before the deadline below.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {getOrderErrorMessage(error)}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Order details</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div className="flex justify-between gap-4">
              <dt>Listing</dt>
              <dd>{order.listing.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Status</dt>
              <dd>{formatOrderStatusLabel(order.status)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Fulfillment</dt>
              <dd>
                {order.selectedFulfillmentMode
                  ? formatFulfillmentModeLabel(order.selectedFulfillmentMode)
                  : "Selection required"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Shipping fee</dt>
              <dd>{formatMoney(order.shippingFeeCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Total due</dt>
              <dd>{formatMoney(order.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Payment due</dt>
              <dd>{formatUtcDateTime(order.paymentDeadlineAtUtc)}</dd>
            </div>
          </dl>

          {order.payments.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
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
            <div className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Pickup event
              </h4>
              <p className="font-medium text-zinc-950">{order.pickupEvent.name}</p>
              <p>{order.pickupEvent.locationName}</p>
              {order.pickupEvent.instructions ? <p>{order.pickupEvent.instructions}</p> : null}
            </div>
          ) : null}

          {shippingAddress ? (
            <div className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Shipping address
              </h4>
              <p className="whitespace-pre-line">{shippingAddress}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">I sent payment</h3>
          <p className="text-sm text-zinc-600">
            Include {orderNumber} in your payment note when possible so manual review is easier.
          </p>

          <div className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
            <p className="font-medium text-zinc-950">
              {fulfillmentReady
                ? "Fulfillment details are on file."
                : "Fulfillment details still need to be completed before payment submission."}
            </p>
            <Link
              className="mt-2 inline-flex font-medium text-emerald-700 hover:text-emerald-800"
              href={`/account/fulfillment/${order.listing.id}`}
            >
              Update fulfillment details
            </Link>
          </div>

          <ul className="space-y-3 text-sm text-zinc-700">
            {paymentMethods.map((paymentMethod) => (
              <li key={paymentMethod.id} className="rounded-md border border-zinc-200 p-3">
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

          {canSubmitPaymentForOrderStatus(order.status) && fulfillmentReady ? (
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
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
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
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
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
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  name="payerHandle"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Payment note or external reference</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  name="externalReference"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Optional screenshot or proof</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  accept="image/*"
                  name="screenshot"
                  type="file"
                />
              </label>

              <button
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                type="submit"
              >
                I sent payment
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-600">
              {fulfillmentReady
                ? "This order is no longer accepting new payment submissions from this page."
                : "Finish pickup or shipping details first, then return here to submit payment."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
