import { createHash } from "node:crypto";
import { Prisma, type CrossListing } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/config/app-env";
import { dollarsToCents } from "@/lib/money";
import { listingBatchIds } from "@/lib/catalog/batch-operations";
import { isCrossListingChannel, type CrossListingChannel } from "./channels";
import { buildCrossListingPackage, type CrossListingOverrides, type CrossListingPackage, type CrossListingSource } from "./package";
import { CrossListingConnectorError, getDirectConnectionStatus, publishCrossListingPackage } from "./connectors";

export class CrossListingError extends Error {}
const sourceInclude = { images: { orderBy: { sortOrder: "asc" as const } }, auction: true };
const editableStatuses = ["ready", "blocked", "error"];
const externalStatuses = ["posted", "external_draft", "sending", "review"];
export type CrossListingView = {
  id: string; listingId: string | null; channel: CrossListingChannel; status: string; version: number;
  item: CrossListingPackage; sourceChanged: boolean; needsRemoval: boolean; issues: string[];
  externalUrl: string | null; externalId: string | null; lastError: string | null; updatedAt: string;
  editable: boolean; canSend: boolean; canResolve: boolean;
  edit: { title: string; description: string; conditionNote: string; price: string };
};
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function packageFor(listing: CrossListingSource, channel: CrossListingChannel, overrides: CrossListingOverrides = {}) {
  return buildCrossListingPackage({ listing, channel, overrides, siteUrl: getAppEnv().app.url });
}
function fingerprint(item: CrossListingPackage) { return createHash("sha256").update(JSON.stringify(item)).digest("hex"); }
function overridesFor(row: CrossListing) { return row.overrides as CrossListingOverrides; }

export function crossListingExternalUrl(channel: CrossListingChannel, value: unknown) {
  if (typeof value !== "string" || value.length > 1000) throw new CrossListingError("Paste the published listing's web address.");
  const domains: Record<CrossListingChannel, string[]> = {
    facebook_marketplace: ["facebook.com"], facebook_page: ["facebook.com"], facebook_shop: ["facebook.com"],
    ebay: ["ebay.com", "ebay.co.uk", "ebay.ca", "ebay.com.au", "ebay.de"], craigslist: ["craigslist.org"],
    mercari: ["mercari.com"], shopify: ["myshopify.com", "admin.shopify.com"],
  };
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CrossListingError("Enter a valid HTTPS listing address."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !domains[channel].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new CrossListingError("Use an HTTPS listing address on the selected service. For Shopify, use its store admin address.");
  }
  return url.toString();
}

export function crossListingOverrides(value: unknown): CrossListingOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrossListingError("Enter the destination's item details.");
  const input = value as Record<string, unknown>;
  const result: CrossListingOverrides = {};
  for (const [field, limit] of [["title", 200], ["description", 20000], ["conditionNote", 2000]] as const) {
    if (typeof input[field] !== "string" || input[field].length > limit) throw new CrossListingError(`Check the ${field === "conditionNote" ? "condition" : field}; its limit is ${limit} characters.`);
    result[field] = input[field].trim();
  }
  if (input.price !== "") {
    const cents = dollarsToCents(input.price);
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new CrossListingError("Enter a price in dollars, such as 12.50.");
    result.priceCents = cents;
  }
  return result;
}

export function crossListingView(row: CrossListing & { listing: CrossListingSource | null }): CrossListingView {
  if (!isCrossListingChannel(row.channel)) throw new CrossListingError("This destination is not supported.");
  const snapshot = row.snapshot as unknown as CrossListingPackage;
  const current = row.listing ? packageFor(row.listing, row.channel, overridesFor(row)) : null;
  const sourceChanged = !row.listing || fingerprint(packageFor(row.listing, row.channel)) !== row.sourceHash;
  const needsRemoval = externalStatuses.includes(row.status) && (!row.listing || !["draft", "published"].includes(row.listing.status) || (row.channel === "facebook_page" && !current?.ready));
  const issues = [...(current?.blockingReasons ?? ["The original Layu listing was deleted."])];
  if (sourceChanged) issues.push("The Layu listing changed. Review the latest details before posting or updating this destination.");
  if (needsRemoval) issues.unshift("This item is no longer available. Check this destination and remove the offer or update the promotion.");
  const editable = editableStatuses.includes(row.status) && Boolean(row.listing);
  const override = overridesFor(row);
  const priceCents = override.priceCents ?? row.listing?.fixedPriceCents;
  return {
    id: row.id, listingId: row.listingId, channel: row.channel, status: row.status, version: row.version, item: snapshot,
    sourceChanged, needsRemoval, issues: [...new Set(issues)], externalUrl: row.externalUrl, externalId: row.externalId,
    lastError: row.lastError, updatedAt: row.updatedAtUtc.toISOString(), editable,
    canSend: editable && !sourceChanged && Boolean(current?.ready) && getDirectConnectionStatus(row.channel).ready,
    canResolve: row.status === "review" || (row.status === "sending" && row.updatedAtUtc.getTime() < Date.now() - 5 * 60_000),
    edit: { title: override.title ?? row.listing?.title ?? snapshot.title, description: override.description ?? row.listing?.description ?? "",
      conditionNote: override.conditionNote ?? row.listing?.conditionNote ?? "", price: priceCents == null ? "" : (priceCents / 100).toFixed(2) },
  };
}

export function crossListingRemovalFilter(): Prisma.CrossListingWhereInput {
  return { status: { in: externalStatuses }, OR: [
    { listing: null },
    { listing: { status: { notIn: ["draft", "published"] } } },
    { channel: "facebook_page", listing: { status: "draft" } },
    { channel: "facebook_page", listing: { auction: { OR: [{ status: { not: "live" } }, { endAtUtc: { lte: new Date() } }] } } },
  ] };
}

export async function listCrossListings(sellerUserId: string, page = 1, listingIds?: string[], attention = false) {
  const where = { ...(attention ? crossListingRemovalFilter() : {}), sellerUserId, ...(listingIds?.length ? { listingId: { in: listingIds } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.crossListing.findMany({ where, include: { listing: { include: sourceInclude } }, orderBy: [{ updatedAtUtc: "desc" }, { id: "asc" }], skip: (page - 1) * 100, take: 100 }),
    prisma.crossListing.count({ where }),
  ]);
  return { rows: rows.map(crossListingView), total };
}

export async function prepareCrossListings(input: { sellerUserId: string; listingIds: unknown; channels: unknown }) {
  const ids = listingBatchIds(input.listingIds);
  if (!Array.isArray(input.channels) || !input.channels.length || input.channels.length > 7 || !input.channels.every(isCrossListingChannel)) throw new CrossListingError("Choose at least one supported destination.");
  const channels = [...new Set(input.channels)] as CrossListingChannel[];
  return prisma.$transaction(async (tx) => {
    const listings = await tx.listing.findMany({ where: { id: { in: ids }, sellerUserId: input.sellerUserId }, include: sourceInclude });
    if (listings.length !== ids.length) throw new CrossListingError("A selected listing is unavailable. Refresh the selection.");
    for (const listing of listings) for (const channel of channels) {
      const item = packageFor(listing, channel);
      // Preparing the same batch never overwrites edits or forgets an existing external post.
      await tx.crossListing.upsert({ where: { listingId_channel: { listingId: listing.id, channel } }, update: {},
        create: { sellerUserId: input.sellerUserId, listingId: listing.id, channel, status: item.ready ? "ready" : "blocked", snapshot: json(item), overrides: {}, sourceHash: fingerprint(item) } });
    }
    return { count: listings.length * channels.length };
  }, { timeout: 30_000 });
}

export async function getCrossListingRows(sellerUserId: string, value: unknown) {
  const ids = listingBatchIds(value);
  const rows = await prisma.crossListing.findMany({ where: { id: { in: ids }, sellerUserId }, include: { listing: { include: sourceInclude } } });
  if (rows.length !== ids.length) throw new CrossListingError("A selected destination record was not found.");
  return ids.map((id) => rows.find((row) => row.id === id)!);
}

export async function actOnCrossListing(input: { sellerUserId: string; id: string; version: unknown; action: unknown; fields?: unknown; externalUrl?: unknown; checked?: unknown }) {
  if (!Number.isInteger(input.version) || Number(input.version) < 1) throw new CrossListingError("Refresh before changing this item.");
  const [row] = await getCrossListingRows(input.sellerUserId, [input.id]);
  const view = crossListingView(row);
  if (row.version !== input.version) throw new CrossListingError("This item changed in another window. Refresh and review it.");
  async function update(data: Prisma.CrossListingUpdateManyMutationInput) {
    const result = await prisma.crossListing.updateMany({ where: { id: row.id, sellerUserId: input.sellerUserId, version: row.version, status: row.status }, data: { ...data, version: { increment: 1 } } });
    if (result.count !== 1) throw new CrossListingError("Another action changed this item. Refresh before retrying.");
  }
  if (input.action === "save" || input.action === "refresh") {
    if (!view.editable || !row.listing) throw new CrossListingError("This record has already been sent. Edit the existing post at its destination.");
    const overrides = input.action === "save" ? crossListingOverrides(input.fields) : overridesFor(row);
    const item = packageFor(row.listing, view.channel, overrides);
    await update({ overrides: json(overrides), snapshot: json(item), sourceHash: fingerprint(packageFor(row.listing, view.channel)), status: item.ready ? "ready" : "blocked", lastError: null });
    return { message: "Destination details saved. Your Layu listing is unchanged." };
  }
  if (input.action === "mark_posted") {
    if (!view.editable && !view.canResolve) throw new CrossListingError("This record is already recorded or is still being sent.");
    if (view.editable && (view.sourceChanged || !view.item.ready)) throw new CrossListingError("Refresh and resolve the item details before recording a post.");
    const externalUrl = crossListingExternalUrl(view.channel, input.externalUrl);
    await update({ status: view.channel === "shopify" ? "external_draft" : "posted", externalUrl, lastError: null });
    return { message: "External listing recorded. Keep its stock and sold status up to date on each service." };
  }
  if (input.action === "mark_removed") {
    if (!["posted", "external_draft", "review"].includes(row.status) && !view.canResolve) throw new CrossListingError("Only an external post or uncertain attempt can be marked removed.");
    if (input.checked !== true) throw new CrossListingError("Confirm that you removed the external offer or updated the promotion first.");
    await update({ status: "removed", lastError: null });
    return { message: "External removal recorded. No Layu order or payment was changed." };
  }
  if (input.action === "not_created") {
    if (!view.canResolve || input.checked !== true) throw new CrossListingError("Check the destination account and confirm that no post or product was created before retrying.");
    await update({ status: "error", lastError: "You confirmed that the previous attempt created no external post or product." });
    return { message: "The item can be reviewed and sent again." };
  }
  if (input.action !== "send") throw new CrossListingError("Choose a supported action.");
  if (!view.canSend || input.checked !== true) throw new CrossListingError("Review the current item and connection, then confirm the send action.");
  await update({ status: "sending", lastError: null });
  try {
    const result = await publishCrossListingPackage(view.item, `layu-${row.id}`);
    const saved = await prisma.crossListing.updateMany({ where: { id: row.id, status: "sending", version: row.version + 1 }, data: {
      status: result.externalStatus === "draft" ? "external_draft" : "posted", externalId: result.externalId, externalUrl: result.url, lastError: null, version: { increment: 1 },
    } });
    if (saved.count !== 1) throw new Error("Send result could not be recorded.");
    return { message: result.externalStatus === "draft" ? "Shopify draft created. It is not published or available for purchase." : "Facebook Page promotion posted." };
  } catch (error) {
    const uncertain = !(error instanceof CrossListingConnectorError) || error.uncertain;
    const message = error instanceof CrossListingConnectorError ? error.message : "The destination may have received this item. Check your account before retrying.";
    // A timeout or failed result save is deliberately never retried automatically.
    await prisma.crossListing.updateMany({ where: { id: row.id, status: "sending", version: row.version + 1 }, data: {
      status: uncertain ? "review" : "error", lastError: message.slice(0, 1000), version: { increment: 1 },
    } });
    throw new CrossListingError(message);
  }
}
