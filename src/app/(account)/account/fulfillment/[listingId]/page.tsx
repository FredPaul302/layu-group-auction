import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deserializeShippingAddress,
  formatShippingAddress,
  getAccountOrderByListingId
} from "@/lib/orders";
import {
  formatFulfillmentModeLabel,
  formatMoney,
  formatOrderStatusLabel,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { readStatusQueryParam } from "@/lib/catalog/service";

type AccountFulfillmentPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getFulfillmentErrorMessage(code: string | null) {
  switch (code) {
    case "pickup_event_required":
      return "A pickup event must be attached before pickup can be confirmed.";
    case "shipping_address_required":
      return "Complete every required shipping address field.";
    case "order_status_invalid":
      return "This order can no longer change fulfillment details.";
    default:
      return null;
  }
}

export default async function AccountFulfillmentPage({
  params,
  searchParams
}: AccountFulfillmentPageProps) {
  const user = await requireAuthenticatedUser();
  const { listingId } = await params;
  const [order, resolvedSearchParams] = await Promise.all([
    getAccountOrderByListingId({
      listingId,
      userId: user.id
    }),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);
  const shippingAddress = deserializeShippingAddress(order.shippingAddressText);
  const shippingAddressDisplay = formatShippingAddress(shippingAddress);
  const selectedPickupEvent = order.pickupEvent;
  const needsChoice = order.listing.fulfillmentMode === "pickup_or_shipping";

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Fulfillment details</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Confirm pickup or shipping details here so the order can move cleanly from payment into
          fulfillment.
        </p>
      </section>

      {status === "fulfillment_saved" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Fulfillment details saved.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {getFulfillmentErrorMessage(error)}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Order summary</h3>
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
              <dt>Listing fulfillment</dt>
              <dd>{formatFulfillmentModeLabel(order.listing.fulfillmentMode)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Selected fulfillment</dt>
              <dd>
                {order.selectedFulfillmentMode
                  ? formatFulfillmentModeLabel(order.selectedFulfillmentMode)
                  : "Selection required"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Total due</dt>
              <dd>{formatMoney(order.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Payment deadline</dt>
              <dd>{formatUtcDateTime(order.paymentDeadlineAtUtc)}</dd>
            </div>
          </dl>

          {selectedPickupEvent ? (
            <div className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
              <h4 className="font-semibold text-zinc-950">Pickup instructions</h4>
              <p>{selectedPickupEvent.name}</p>
              <p>{selectedPickupEvent.locationName}</p>
              {selectedPickupEvent.address ? <p>{selectedPickupEvent.address}</p> : null}
              <p>
                {formatUtcDateTime(selectedPickupEvent.startAtUtc)} to{" "}
                {formatUtcDateTime(selectedPickupEvent.endAtUtc)}
              </p>
              {selectedPickupEvent.instructions ? <p>{selectedPickupEvent.instructions}</p> : null}
            </div>
          ) : null}

          {shippingAddressDisplay ? (
            <div className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm text-zinc-700">
              <h4 className="font-semibold text-zinc-950">Shipping address</h4>
              <p className="whitespace-pre-line">{shippingAddressDisplay}</p>
            </div>
          ) : null}

          <Link
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={`/account/orders/${order.id}/payment`}
          >
            Back to payment page
          </Link>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Update fulfillment</h3>
          <form action={`/api/fulfillment/${listingId}`} className="space-y-4" method="post">
            {needsChoice ? (
              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Choose pickup or shipping</span>
                <select
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={order.selectedFulfillmentMode ?? "pickup_only"}
                  name="fulfillmentMode"
                >
                  <option value="pickup_only">Pickup</option>
                  <option value="shipping_only">Shipping</option>
                </select>
              </label>
            ) : (
              <input
                name="fulfillmentMode"
                type="hidden"
                value={order.listing.fulfillmentMode === "shipping_only" ? "shipping_only" : "pickup_only"}
              />
            )}

            {order.listing.fulfillmentMode !== "pickup_only" ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-zinc-900">Shipping address</p>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span>Recipient name</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    defaultValue={shippingAddress?.recipientName ?? ""}
                    name="recipientName"
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span>Address line 1</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    defaultValue={shippingAddress?.addressLine1 ?? ""}
                    name="addressLine1"
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span>Address line 2</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    defaultValue={shippingAddress?.addressLine2 ?? ""}
                    name="addressLine2"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span>City</span>
                    <input
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      defaultValue={shippingAddress?.city ?? ""}
                      name="city"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span>State or province</span>
                    <input
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      defaultValue={shippingAddress?.stateOrProvince ?? ""}
                      name="stateOrProvince"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span>Postal code</span>
                    <input
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      defaultValue={shippingAddress?.postalCode ?? ""}
                      name="postalCode"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span>Country code</span>
                    <input
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      defaultValue={shippingAddress?.countryCode ?? "US"}
                      name="countryCode"
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span>Phone number</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    defaultValue={shippingAddress?.phoneNumber ?? ""}
                    name="phoneNumber"
                  />
                </label>
              </div>
            ) : null}

            <button
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              type="submit"
            >
              Save fulfillment details
            </button>
          </form>

          {order.listing.fulfillmentMode === "pickup_only" && !selectedPickupEvent ? (
            <p className="text-sm text-red-700">
              Pickup is required, but no pickup event is attached yet. Contact the seller before
              sending payment.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
