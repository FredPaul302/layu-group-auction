import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { getPublicListingById, readStatusQueryParam } from "@/lib/catalog/service";
import { getFixedPricePayFirstGate } from "@/lib/orders";

export const dynamic = "force-dynamic";

type ClaimPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getClaimErrorMessage(code: string | null) {
  switch (code) {
    case "email_verification_required":
      return "Verify your email before reserving this item.";
    case "bidder_blocked":
      return "This account is currently restricted from fixed-price checkout.";
    case "listing_unavailable":
      return "This listing is no longer available to reserve.";
    default:
      return null;
  }
}

export default async function ListingClaimPage({
  params,
  searchParams
}: ClaimPageProps) {
  const { listingId } = await params;
  const [listing, user, resolvedSearchParams] = await Promise.all([
    getPublicListingById(listingId).catch(() => notFound()),
    getCurrentUser(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);

  if (!user) {
    redirect(`/auth/login?next=/listings/${listingId}/claim`);
  }

  if (listing.listingType !== "fixed_price" || listing.fixedPriceCents == null) {
    redirect(`/listings/${listing.id}`);
  }

  const claimGate = getFixedPricePayFirstGate({
    subject: user,
    snapshot: {
      listingType: listing.listingType,
      listingStatus: listing.status,
      fixedPriceCents: listing.fixedPriceCents,
      requiredBidTier: listing.category.requiredBidTier,
      fulfillmentMode: listing.fulfillmentMode,
      shippingFeeCents: listing.shippingFeeCents
    }
  });
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Buy it now
        </p>
        <h2 className="text-3xl font-semibold text-zinc-950">{listing.title}</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Starting buy-it-now checkout creates a reserved order and opens the payment page while
          manual external-payment review still controls whether the sale is finalized.
        </p>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {getClaimErrorMessage(error)}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Order summary</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div className="flex justify-between gap-4">
              <dt>Category</dt>
              <dd>{listing.category.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Price</dt>
              <dd>{formatMoney(listing.fixedPriceCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Shipping fee</dt>
              <dd>
                {listing.fulfillmentMode === "shipping_only"
                  ? formatMoney(listing.shippingFeeCents)
                  : listing.fulfillmentMode === "pickup_or_shipping"
                    ? "Depends on fulfillment choice"
                    : formatMoney(0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Fulfillment</dt>
              <dd>{listing.fulfillmentMode}</dd>
            </div>
            {listing.pickupEvent ? (
              <div className="flex justify-between gap-4">
                <dt>Pickup event</dt>
                <dd>{formatUtcDateTime(listing.pickupEvent.startAtUtc)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Confirm reservation</h3>
          <p className="text-sm text-zinc-600">
            Payment is still due within 48 hours by default. Buy it now reserves this listing
            immediately, and rejected or overdue reservations release it back into the catalog.
          </p>

          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Use the payment page after checkout starts to submit PayPal, Venmo, or Cash App
            payment details for manual review. Admin approval finalizes the sale.
          </div>

          {claimGate.canStartCheckout ? (
            <form action={`/api/listings/${listing.id}/claim`} method="post">
              <button
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                type="submit"
              >
                Reserve item
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-600">
              You need a logged-in, email-verified account that is not blocked before checkout can
              start.
            </p>
          )}

          <Link
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={`/listings/${listing.id}`}
          >
            Back to listing
          </Link>
        </div>
      </section>
    </div>
  );
}
