import type { BidTier, FulfillmentMode, ListingType } from "@prisma/client";

export { formatMoney } from "./index";
import { formatMoney } from "./index";

export function formatUtcDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = value instanceof Date ? value : new Date(value);

  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date)} UTC`;
}

export function formatDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatBidTierLabel(tier: BidTier) {
  switch (tier) {
    case "tier_5":
      return "$5 tier";
    case "tier_10":
      return "$10 tier";
    case "tier_20":
      return "$20 tier";
    case "full":
      return "Full tier";
    case "tier_0":
    default:
      return "No tier";
  }
}

export function formatListingTypeLabel(listingType: ListingType) {
  return listingType === "fixed_price" ? "Fixed price" : "Auction";
}

export function formatFulfillmentModeLabel(fulfillmentMode: FulfillmentMode) {
  switch (fulfillmentMode) {
    case "pickup_only":
      return "Pickup only";
    case "shipping_only":
      return "Shipping only";
    case "pickup_or_shipping":
      return "Pickup or shipping";
  }
}

export function formatListingPriceLabel(input: {
  listingType: ListingType;
  fixedPriceCents: number | null;
  auctionPriceCents: number | null;
}) {
  if (input.listingType === "fixed_price") {
    return input.fixedPriceCents == null
      ? "Fixed price pending"
      : `Fixed price ${formatMoney(input.fixedPriceCents)}`;
  }

  return input.auctionPriceCents == null
    ? "Current price pending"
    : `Current price ${formatMoney(input.auctionPriceCents)}`;
}
