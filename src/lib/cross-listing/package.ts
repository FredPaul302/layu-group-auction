import { centsToDollars, formatMoney, maxMoneyCents } from "../money";
import { getCrossListingChannel, type CrossListingChannel } from "./channels";

export type CrossListingSource = {
  id: string;
  slug?: string;
  sku?: string | null;
  title: string;
  description?: string | null;
  conditionNote?: string | null;
  listingType: "auction" | "fixed_price";
  status: string;
  fixedPriceCents?: number | null;
  auction?: { startingBidCents?: number; endAtUtc?: Date | string; status?: string } | null;
  images: readonly { publicUrl: string; sortOrder: number; isPrimary?: boolean; altText?: string | null }[];
};

export type CrossListingOverrides = {
  title?: string;
  description?: string;
  conditionNote?: string;
  priceCents?: number | null;
};

export type CrossListingPackage = {
  listingId: string;
  channel: CrossListingChannel;
  title: string;
  description: string;
  condition: string;
  priceCents: number | null;
  priceDollars: string;
  sku: string;
  websiteUrl: string;
  photos: { url: string; position: number; altText: string }[];
  mode: "item" | "promotion";
  warnings: string[];
  blockingReasons: string[];
  ready: boolean;
};

function absoluteWebUrl(value: string, base: string): string | null {
  try {
    if (!value.trim()) return null;
    const parsed = new URL(value, base);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch { return null; }
}

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maxMoneyCents;
}

export function buildCrossListingPackage(input: {
  listing: CrossListingSource;
  channel: CrossListingChannel;
  siteUrl: string;
  overrides?: CrossListingOverrides;
  now?: Date;
  timeZone?: string;
}): CrossListingPackage {
  const { listing, channel, overrides = {} } = input;
  const channelInfo = getCrossListingChannel(channel);
  const baseUrl = absoluteWebUrl(input.siteUrl, input.siteUrl);
  if (!baseUrl) throw new Error("A valid website address is required.");
  const websiteUrl = new URL(`/listings/${encodeURIComponent(listing.id)}`, baseUrl).toString();
  const mode = channel === "facebook_page" ? "promotion" : "item";
  const title = (overrides.title ?? listing.title).trim();
  const condition = (overrides.conditionNote ?? listing.conditionNote ?? "").trim();
  const body = (overrides.description ?? listing.description ?? "").trim();
  const price = overrides.priceCents !== undefined ? overrides.priceCents : listing.fixedPriceCents;
  // Auction Buy It Now amounts must never become a separate external item offer.
  const priceCents = listing.listingType === "fixed_price" && validPrice(price) ? price : null;
  const warnings: string[] = [];
  const blockingReasons: string[] = [];
  const descriptionParts = [body, condition ? `Condition: ${condition}` : ""].filter(Boolean);
  const photos: CrossListingPackage["photos"] = [];
  const seenPhotos = new Set<string>();
  for (const photo of [...listing.images].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.sortOrder - b.sortOrder)) {
    const url = absoluteWebUrl(photo.publicUrl, baseUrl);
    if (!url || new URL(url).pathname.startsWith("/api/admin/")) {
      warnings.push("A photo was omitted because it does not have a public web address.");
      continue;
    }
    if (seenPhotos.has(url)) continue;
    seenPhotos.add(url);
    photos.push({ url, position: photos.length + 1, altText: photo.altText?.trim() || title });
  }
  if (!title) blockingReasons.push("Add an item title.");
  if (!body) blockingReasons.push("Add a description.");
  if (photos.length === 0) blockingReasons.push("Add at least one publicly accessible item photo.");
  if (!condition) warnings.push("Review the item's condition before posting.");
  if (!["draft", "published"].includes(listing.status)) blockingReasons.push("This item is no longer available for a new external listing.");
  if (channelInfo.titleMaxLength && [...title].length > channelInfo.titleMaxLength) {
    blockingReasons.push(`Shorten the ${channelInfo.label} title to ${channelInfo.titleMaxLength} characters or fewer.`);
  }
  if (mode === "item") {
    if (listing.listingType === "auction") blockingReasons.push("Promote this auction on your Facebook Page. Auction items cannot be copied as separately purchasable listings.");
    else if (priceCents === null) blockingReasons.push("Enter a fixed price greater than $0.00.");
    warnings.push("Stock and sales are not synchronized. Reserve separate stock or remove the other offers promptly after a sale.");
    if (channel === "facebook_shop") warnings.push("Shop eligibility and a supported catalog connection must be confirmed before publication.");
    if (channel === "ebay") warnings.push("Choose eBay category, item specifics, condition, shipping, and return settings before publishing.");
    if (channel === "shopify") {
      warnings.push("Import creates draft products with zero inventory. Confirm your Shopify store currency is USD and review stock, shipping, and tax settings before activation.");
      if (photos.some((photo) => !photo.url.startsWith("https://"))) blockingReasons.push("Shopify needs publicly accessible HTTPS photo addresses.");
    }
  } else {
    if (listing.status !== "published") blockingReasons.push("Publish the listing on Layu Market before promoting its link.");
    if (listing.listingType === "auction") {
      descriptionParts.unshift("Auction on Layu Market");
      if (validPrice(listing.auction?.startingBidCents)) descriptionParts.push(`Starting bid: ${formatMoney(listing.auction.startingBidCents)}.`);
      const end = listing.auction?.endAtUtc ? new Date(listing.auction.endAtUtc) : null;
      if (!end || !Number.isFinite(end.getTime())) blockingReasons.push("Set the auction closing date before promoting it.");
      else {
        const closingTime = new Intl.DateTimeFormat("en-US", {
          timeZone: input.timeZone ?? "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        }).format(end);
        descriptionParts.push(`Auction closes: ${closingTime}.`);
        if (end.getTime() <= (input.now ?? new Date()).getTime()) blockingReasons.push("This auction has already ended.");
      }
      if (listing.auction?.status && listing.auction.status !== "live") blockingReasons.push("Only a live auction can be promoted.");
      descriptionParts.push(`See the item and place bids on Layu Market: ${websiteUrl}`);
    } else {
      if (priceCents === null) blockingReasons.push("Enter a fixed price greater than $0.00.");
      else descriptionParts.push(`Price: ${formatMoney(priceCents)}.`);
      descriptionParts.push(`View this item on Layu Market: ${websiteUrl}`);
    }
  }
  return {
    listingId: listing.id, channel, title, description: descriptionParts.join("\n\n"), condition,
    priceCents, priceDollars: centsToDollars(priceCents), sku: listing.sku?.trim() || `LAYU-${listing.id}`,
    websiteUrl, photos, mode, warnings: [...new Set(warnings)], blockingReasons, ready: blockingReasons.length === 0,
  };
}

export function buildCrossListingText(item: CrossListingPackage): string {
  return [
    `${getCrossListingChannel(item.channel).label} — ${item.mode === "promotion" ? "promotion" : "item preparation"}`,
    `Title: ${item.title}`, item.priceDollars ? `Price: $${item.priceDollars} USD` : "", `SKU: ${item.sku}`,
    "", item.description, "", `Layu reference: ${item.websiteUrl}`, "", "Photos (in order):",
    ...item.photos.map((photo) => `${photo.position}. ${photo.url}`), "", "Prepared only; this file does not publish anything.",
    ...item.blockingReasons.map((reason) => `Needs attention: ${reason}`), ...item.warnings.map((warning) => `Note: ${warning}`),
  ].join("\n");
}

export function buildCrossListingJson(items: readonly CrossListingPackage[]): string {
  return JSON.stringify({ format: "layu-cross-listing-preparation-v1", currency: "USD", published: false, items }, null, 2);
}

// Quoting alone does not prevent formula execution when a CSV is opened in a spreadsheet.
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function shopifyDraftHandle(listingId: string): string {
  // CUID database IDs already satisfy this; reject ambiguous IDs rather than merging
  // different items through case folding or lossy punctuation replacement.
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(listingId)) throw new Error("A valid stable listing ID is required for Shopify.");
  return `layu-${listingId}`;
}

export function shopifyDraftOwnershipTag(listingId: string): string {
  return `layu-listing-${shopifyDraftHandle(listingId).slice(5)}`;
}

export function buildShopifyDraftCsv(items: readonly CrossListingPackage[]): string {
  const headers = ["Title", "URL handle", "Description", "Published on online store", "Status", "SKU", "Option1 name", "Option1 value", "Price", "Inventory tracker", "Inventory quantity", "Continue selling when out of stock", "Fulfillment service", "Product image URL", "Image position", "Image alt text", "Tags"];
  const rows: (string | number)[][] = [headers];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.channel !== "shopify" || item.mode !== "item" || !item.ready || !validPrice(item.priceCents)) throw new Error("Only ready, fixed-price Shopify items can be exported to the Shopify draft CSV.");
    if (seen.has(item.listingId)) throw new Error("Choose each Shopify item only once.");
    seen.add(item.listingId);
    // The database ID keeps this handle stable when the seller edits the title or SKU.
    const handle = shopifyDraftHandle(item.listingId);
    const description = item.description.split(/\r?\n/u).map((line) => escapeHtml(line)).join("<br>");
    item.photos.forEach((photo, index) => {
      rows.push(index === 0
        ? [item.title, handle, description, "false", "draft", item.sku, "Title", "Default Title", item.priceDollars, "shopify", "0", "deny", "manual", photo.url, photo.position, photo.altText.slice(0, 512), shopifyDraftOwnershipTag(item.listingId)]
        : ["", handle, "", "", "", "", "", "", "", "", "", "", "", photo.url, photo.position, photo.altText.slice(0, 512), ""]);
    });
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
