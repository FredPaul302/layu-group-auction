/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  getAuctionBidGate,
  getCurrentAuctionPriceCents,
  getNextMinimumBidCents
} from "@/lib/auctions";
import { getCurrentUser } from "@/lib/auth";
import {
  formatFulfillmentModeLabel,
  formatListingTypeLabel,
  formatMoney,
  formatUtcDateTime
} from "@/lib/catalog/presentation";
import { getPublicListingById, readStatusQueryParam } from "@/lib/catalog/service";

type ListingDetailPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getBidErrorMessage(code: string | null) {
  switch (code) {
    case "authentication_required":
      return "Sign in before placing a bid.";
    case "email_verification_required":
      return "Verify your email before placing a bid.";
    case "secondary_verification_required":
      return "Complete Persona or deposit verification before placing a bid.";
    case "bidder_blocked":
      return "This bidder account is currently blocked.";
    case "tier_access_required":
      return "Your approved tier does not meet this category's requirement.";
    case "listing_not_biddable":
      return "This listing is not currently open for bidding.";
    case "auction_not_live":
      return "This auction is not currently live.";
    case "auction_closed":
      return "This auction has already ended.";
    case "bid_amount_invalid":
      return "Bid amounts must be whole-number cents.";
    case "bid_too_low":
      return "That bid is below the next allowed minimum.";
    default:
      return null;
  }
}

function getBidGateMessage(reason: ReturnType<typeof getAuctionBidGate>["reason"]): ReactNode {
  switch (reason) {
    case "authentication_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/auth/login">
            Sign in
          </Link>{" "}
          to place a bid.
        </p>
      );
    case "email_verification_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/auth/verify-email"
          >
            Verify your email
          </Link>{" "}
          before bidding.
        </p>
      );
    case "secondary_verification_required":
      return (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href="/account/verification"
          >
            Complete secondary verification
          </Link>{" "}
          before bidding.
        </p>
      );
    case "tier_access_required":
      return (
        <p className="text-sm text-zinc-600">
          Your approved bidding tier does not allow bids in this category.
        </p>
      );
    case "bidder_blocked":
      return <p className="text-sm text-zinc-600">This account is blocked from bidding.</p>;
    case "auction_not_live":
      return <p className="text-sm text-zinc-600">This auction is no longer live.</p>;
    case "auction_closed":
      return (
        <p className="text-sm text-zinc-600">
          This auction has ended and is waiting for the close job to settle results.
        </p>
      );
    case "listing_not_biddable":
      return <p className="text-sm text-zinc-600">This listing is not currently open for bids.</p>;
    default:
      return (
        <p className="text-sm text-zinc-600">
          Bidding details will appear here when the auction is live.
        </p>
      );
  }
}

export default async function ListingDetailPage({
  params,
  searchParams
}: ListingDetailPageProps) {
  const { listingId } = await params;
  const [listing, currentUser, resolvedSearchParams] = await Promise.all([
    getPublicListingById(listingId).catch(() => notFound()),
    getCurrentUser(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);

  const primaryImage = listing.images.find((image) => image.isPrimary) ?? listing.images[0];
  const bidStatus = readStatusQueryParam(resolvedSearchParams.bidStatus);
  const bidError = readStatusQueryParam(resolvedSearchParams.bidError);
  const currentAuctionPriceCents =
    listing.auction && listing.listingType === "auction"
      ? getCurrentAuctionPriceCents({
          startingBidCents: listing.auction.startingBidCents,
          currentHighestBidCents: listing.auction.currentHighestBidCents
        })
      : null;
  const nextMinimumBidCents =
    listing.auction && listing.listingType === "auction"
      ? getNextMinimumBidCents({
          startingBidCents: listing.auction.startingBidCents,
          currentHighestBidCents: listing.auction.currentHighestBidCents,
          minimumIncrementCents: listing.auction.minimumIncrementCents
        })
      : null;
  const auctionBidGate =
    listing.auction && listing.listingType === "auction"
      ? getAuctionBidGate({
          subject: currentUser,
          snapshot: {
            listingType: listing.listingType,
            listingStatus: listing.status,
            auctionStatus: listing.auction.status,
            endAtUtc: listing.auction.endAtUtc,
            startingBidCents: listing.auction.startingBidCents,
            currentHighestBidCents: listing.auction.currentHighestBidCents,
            minimumIncrementCents: listing.auction.minimumIncrementCents,
            requiredBidTier: listing.category.requiredBidTier
          },
          now: new Date()
        })
      : null;
  const viewerIsWinning =
    Boolean(currentUser) &&
    Boolean(listing.auction?.currentHighestBidderId) &&
    listing.auction?.currentHighestBidderId === currentUser?.id;
  const priceSummary =
    listing.listingType === "auction" && currentAuctionPriceCents != null
      ? `Current price ${formatMoney(currentAuctionPriceCents)}`
      : listing.fixedPriceCents != null
        ? `Fixed price ${formatMoney(listing.fixedPriceCents)}`
        : "Price pending";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {formatListingTypeLabel(listing.listingType)}
          </p>
          <h2 className="text-3xl font-semibold text-zinc-950">{listing.title}</h2>
          <p className="text-base text-zinc-600">{priceSummary}</p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" href="/listings">
            Back to listings
          </Link>
          <Link
            className="font-medium text-emerald-700 hover:text-emerald-800"
            href={`/categories/${listing.category.slug}`}
          >
            Browse {listing.category.name}
          </Link>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4">
          {primaryImage ? (
            <img
              alt={primaryImage.altText ?? listing.title}
              className="h-auto w-full rounded-md border border-zinc-200 object-cover"
              src={primaryImage.publicUrl}
            />
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-100 text-sm text-zinc-500">
              Image pending
            </div>
          )}

          {listing.images.length > 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {listing.images.slice(1).map((image) => (
                <img
                  key={image.id}
                  alt={image.altText ?? listing.title}
                  className="h-44 w-full rounded-md border border-zinc-200 object-cover"
                  src={image.publicUrl}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {listing.listingType === "auction" && listing.auction ? (
            <section className="space-y-4 rounded-md border border-zinc-200 p-5">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-950">Bidding</h3>
                <p className="text-sm text-zinc-600">
                  Verification is required before any bid can be placed.
                </p>
              </div>

              {bidStatus === "placed" ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Bid placed successfully.
                </p>
              ) : null}

              {bidError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {getBidErrorMessage(bidError)}
                </p>
              ) : null}

              <dl className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
                <div className="rounded-md border border-zinc-200 p-4">
                  <dt className="text-zinc-500">Current price</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {currentAuctionPriceCents == null
                      ? "Pending"
                      : formatMoney(currentAuctionPriceCents)}
                  </dd>
                </div>
                <div className="rounded-md border border-zinc-200 p-4">
                  <dt className="text-zinc-500">Next minimum bid</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {nextMinimumBidCents == null ? "Pending" : formatMoney(nextMinimumBidCents)}
                  </dd>
                </div>
              </dl>

              {viewerIsWinning ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  You are currently the highest bidder.
                </p>
              ) : null}

              {auctionBidGate?.canBid && nextMinimumBidCents != null ? (
                <form action={`/api/listings/${listing.id}/bids`} className="space-y-4" method="post">
                  <label className="space-y-2 text-sm text-zinc-700">
                    <span className="font-medium text-zinc-900">Bid amount in cents</span>
                    <input
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      defaultValue={nextMinimumBidCents}
                      min={nextMinimumBidCents}
                      name="amountCents"
                      required
                      step={1}
                      type="number"
                    />
                  </label>

                  <button
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    type="submit"
                  >
                    Place bid
                  </button>
                </form>
              ) : (
                getBidGateMessage(auctionBidGate?.reason ?? null)
              )}
            </section>
          ) : (
            <section className="space-y-2 rounded-md border border-dashed border-zinc-300 p-5">
              <h3 className="text-lg font-semibold text-zinc-950">Purchase status</h3>
              <p className="text-sm text-zinc-600">
                Fixed-price purchase flow remains disabled in this phase.
              </p>
            </section>
          )}

          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Details</h3>
            <dl className="space-y-3 text-sm text-zinc-700">
              <div className="flex justify-between gap-4">
                <dt>Listing status</dt>
                <dd>{listing.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Category</dt>
                <dd>{listing.category.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Fulfillment</dt>
                <dd>{formatFulfillmentModeLabel(listing.fulfillmentMode)}</dd>
              </div>
              {listing.listingType === "auction" && listing.auction ? (
                <div className="flex justify-between gap-4">
                  <dt>Auction end</dt>
                  <dd>{formatUtcDateTime(listing.auction.endAtUtc)}</dd>
                </div>
              ) : null}
              {listing.fulfillmentMode !== "pickup_only" ? (
                <div className="flex justify-between gap-4">
                  <dt>Shipping fee</dt>
                  <dd>{formatMoney(listing.shippingFeeCents)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Description</h3>
            <p className="text-sm leading-6 text-zinc-700">
              {listing.description ?? "No description has been added yet."}
            </p>
            {listing.conditionNote ? (
              <p className="text-sm text-zinc-600">Condition note: {listing.conditionNote}</p>
            ) : null}
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Pickup and shipping</h3>
            {listing.pickupEvent ? (
              <div className="space-y-1 text-sm text-zinc-700">
                <p className="font-medium text-zinc-950">{listing.pickupEvent.name}</p>
                <p>{listing.pickupEvent.locationName}</p>
                {listing.pickupEvent.address ? <p>{listing.pickupEvent.address}</p> : null}
                <p>
                  {formatUtcDateTime(listing.pickupEvent.startAtUtc)} to{" "}
                  {formatUtcDateTime(listing.pickupEvent.endAtUtc)}
                </p>
                {listing.pickupEvent.instructions ? <p>{listing.pickupEvent.instructions}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No pickup event is attached to this listing.</p>
            )}

            {listing.shippingNotes ? (
              <p className="text-sm text-zinc-600">Shipping notes: {listing.shippingNotes}</p>
            ) : null}
          </section>

          <section className="space-y-2 rounded-md border border-dashed border-zinc-300 p-5">
            <h3 className="text-lg font-semibold text-zinc-950">Payment status</h3>
            <p className="text-sm text-zinc-600">
              Payment submission and confirmation remain disabled in this step. Auction close can
              create awaiting-payment orders, but no payment processing or purchase shortcut has
              been added here.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
