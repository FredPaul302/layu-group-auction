import { createHash } from "node:crypto";

import { centsToDollars, dollarsToCents, maxMoneyCents } from "../money";
import { shopifyDraftHandle, shopifyDraftOwnershipTag, type CrossListingPackage } from "./package";

type EnvSource = Record<string, string | undefined>;
type ConnectorOptions = { env?: EnvSource; fetch?: typeof fetch };
type JsonObject = Record<string, unknown>;

export type DirectConnectionStatus = { ready: boolean; summary: string };
export type DirectPublicationResult = {
  externalId: string;
  url: string;
  externalStatus: "posted" | "draft";
};

// Only this server module handles credentials. Never return config or upstream errors to the UI.
export class CrossListingConnectorError extends Error {
  constructor(message: string, public readonly uncertain = false) {
    super(message);
    this.name = "CrossListingConnectorError";
  }
}

function value(env: EnvSource, key: string) {
  return env[key]?.trim() ?? "";
}

function facebookConfig(env: EnvSource) {
  const pageId = value(env, "FACEBOOK_PAGE_ID");
  const token = value(env, "FACEBOOK_PAGE_ACCESS_TOKEN");
  const version = value(env, "FACEBOOK_GRAPH_API_VERSION");
  if (!/^\d+$/u.test(pageId) || !token || !/^v\d{1,3}\.0$/u.test(version)) return null;
  return { pageId, token, version };
}

function shopifyConfig(env: EnvSource) {
  const shop = value(env, "SHOPIFY_SHOP_DOMAIN").toLowerCase();
  const token = value(env, "SHOPIFY_ADMIN_ACCESS_TOKEN");
  // An exact canonical host, never an arbitrary URL, port, subdomain chain, or proxy.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/u.test(shop) || !token) return null;
  return { shop, token };
}

export function getDirectConnectionStatus(channel: string, env: EnvSource = process.env): DirectConnectionStatus {
  if (channel === "facebook_page") {
    return facebookConfig(env)
      ? { ready: true, summary: "Page connection configured. Publishing requires a valid Page token and permission to post." }
      : { ready: false, summary: "Connect your Facebook business Page with its Page ID, Page access token, and Graph API version." };
  }
  if (channel === "shopify") {
    return shopifyConfig(env)
      ? { ready: true, summary: "Shopify connection configured. Fixed-price items are sent as unpublished drafts with no stock." }
      : { ready: false, summary: "Connect a Shopify store using its myshopify.com domain and Admin API access token." };
  }
  return { ready: false, summary: "Prepare the listing here, then finish posting on this destination." };
}

function object(input: unknown): JsonObject | null {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : null;
}

function httpsUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assertPackage(payload: CrossListingPackage, key: string) {
  if (!payload.ready || payload.blockingReasons.length || !payload.title.trim() || !payload.sku.trim() ||
    !httpsUrl(payload.websiteUrl) || !key || key.length > 512 || payload.photos.some((photo) => !httpsUrl(photo.url))) {
    throw new CrossListingConnectorError("Review this listing's details and photos before sending it.");
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  mutation: boolean,
  fetcher: typeof fetch
): Promise<JsonObject> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new CrossListingConnectorError(
      mutation ? "The destination did not confirm the result. Check it before sending again." : "The destination could not be checked. Try again later.",
      mutation
    );
  }
  if (!response.ok) {
    throw new CrossListingConnectorError(
      response.status === 401 || response.status === 403
        ? "The destination rejected the connection. Check its access token and permissions."
        : "The destination could not complete the request. Check its status before trying again.",
      mutation && (response.status === 408 || response.status >= 500)
    );
  }
  let data: JsonObject | null;
  try {
    data = object(await response.json());
  } catch {
    data = null;
  }
  if (!data) throw new CrossListingConnectorError("The destination returned an incomplete result. Check it before sending again.", mutation);
  return data;
}

async function postFacebook(payload: CrossListingPackage, env: EnvSource, fetcher: typeof fetch): Promise<DirectPublicationResult> {
  const config = facebookConfig(env);
  if (!config) throw new CrossListingConnectorError(getDirectConnectionStatus("facebook_page", env).summary);
  if (payload.mode !== "promotion") throw new CrossListingConnectorError("Facebook Page posts must link people to the Layu listing.");
  const body = new URLSearchParams({ message: `${payload.title}\n\n${payload.description}`, link: payload.websiteUrl });
  const response = await requestJson(`https://graph.facebook.com/${config.version}/${config.pageId}/feed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  }, true, fetcher);
  if (response.error) {
    throw new CrossListingConnectorError("Facebook could not confirm the Page post. Check Page permissions and recent posts.", Boolean(response.id));
  }
  if (typeof response.id !== "string" || !/^\d+_\d+$/u.test(response.id) || !response.id.startsWith(`${config.pageId}_`)) {
    throw new CrossListingConnectorError("Facebook did not return a confirmed Page post. Check recent posts before sending again.", true);
  }
  return { externalId: response.id, url: `https://www.facebook.com/${config.pageId}/posts/${response.id.split("_")[1]}`, externalStatus: "posted" };
}

const PRODUCT_FIELDS = `id handle status tags variants(first: 2) { nodes { id price inventoryQuantity inventoryPolicy inventoryItem { sku tracked } } }`;
const LOOKUP_PRODUCT = `query LayuDraftLookup($identifier: ProductIdentifierInput!) {
  shop { currencyCode }
  product: productByIdentifier(identifier: $identifier) { ${PRODUCT_FIELDS} }
}`;
const CREATE_PRODUCT = `mutation LayuDraftCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) { product { ${PRODUCT_FIELDS} } userErrors { field } }
}`;
const UPDATE_VARIANT = `mutation LayuDraftPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
    product { ${PRODUCT_FIELDS} } userErrors { field }
  }
}`;

async function shopifyRequest(
  config: NonNullable<ReturnType<typeof shopifyConfig>>,
  query: string,
  variables: JsonObject,
  mutation: boolean,
  fetcher: typeof fetch
) {
  const result = await requestJson(`https://${config.shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": config.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  }, mutation, fetcher);
  if (result.errors && (!Array.isArray(result.errors) || result.errors.length)) {
    throw new CrossListingConnectorError("Shopify could not confirm this request. Check the app permissions and the product before sending again.", mutation);
  }
  const data = object(result.data);
  if (!data) throw new CrossListingConnectorError("Shopify returned an incomplete result. Check the product before sending again.", mutation);
  return data;
}

function variants(product: JsonObject) {
  const nodes = object(product.variants)?.nodes;
  return Array.isArray(nodes) ? nodes.map(object).filter((node) => node !== null) : [];
}

function ownedDraft(product: JsonObject, handle: string, tag: string) {
  return typeof product.id === "string" && /^gid:\/\/shopify\/Product\/\d+$/u.test(product.id) &&
    product.handle === handle && product.status === "DRAFT" && Array.isArray(product.tags) && product.tags.includes(tag);
}

function contentTag(payload: CrossListingPackage) {
  const serialized = JSON.stringify({
    title: payload.title, description: payload.description, priceCents: payload.priceCents,
    sku: payload.sku, websiteUrl: payload.websiteUrl,
    photos: [...payload.photos].sort((a, b) => a.position - b.position)
  });
  return `layu-content-${createHash("sha256").update(serialized).digest("hex")}`;
}

function completedDraft(product: JsonObject, handle: string, tag: string, payload: CrossListingPackage) {
  const items = variants(product);
  const item = items[0];
  return ownedDraft(product, handle, tag) && Array.isArray(product.tags) && product.tags.includes(contentTag(payload)) &&
    items.length === 1 && item.inventoryQuantity === 0 &&
    item.inventoryPolicy === "DENY" && object(item.inventoryItem)?.tracked === true &&
    object(item.inventoryItem)?.sku === payload.sku && dollarsToCents(item.price) === payload.priceCents;
}

function escapeHtml(input: string) {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function shopifyResult(product: JsonObject, shop: string): DirectPublicationResult {
  const externalId = product.id as string;
  return { externalId, url: `https://${shop}/admin/products/${externalId.split("/").at(-1)}`, externalStatus: "draft" };
}

async function createShopifyDraft(payload: CrossListingPackage, key: string, env: EnvSource, fetcher: typeof fetch): Promise<DirectPublicationResult> {
  const config = shopifyConfig(env);
  if (!config) throw new CrossListingConnectorError(getDirectConnectionStatus("shopify", env).summary);
  if (payload.mode !== "item" || !Number.isSafeInteger(payload.priceCents) || (payload.priceCents ?? 0) <= 0 || (payload.priceCents ?? 0) > maxMoneyCents) {
    throw new CrossListingConnectorError("Only fixed-price items with a valid dollar price can become Shopify drafts.");
  }
  const digest = createHash("sha256").update(key).digest("hex");
  const handle = shopifyDraftHandle(payload.listingId);
  const tag = `layu-export-${digest}`;
  const lookup = await shopifyRequest(config, LOOKUP_PRODUCT, { identifier: { handle } }, false, fetcher);
  if (object(lookup.shop)?.currencyCode !== "USD") {
    throw new CrossListingConnectorError("This connection requires a Shopify store using US dollars. No product was created.");
  }
  if (!("product" in lookup)) throw new CrossListingConnectorError("Shopify could not check for an existing draft. No product was created.");
  const existing = object(lookup.product);
  if (existing) {
    if (completedDraft(existing, handle, tag, payload)) return shopifyResult(existing, config.shop);
    // An earlier partial result or a changed/foreign product must be inspected, never overwritten.
    throw new CrossListingConnectorError("A Shopify product already uses this listing's reference. Review it before sending again.", true);
  }
  if (lookup.product !== null) throw new CrossListingConnectorError("Shopify could not check for an existing draft. No product was created.");

  const created = await shopifyRequest(config, CREATE_PRODUCT, {
    product: {
      title: payload.title,
      descriptionHtml: `<p>${escapeHtml(payload.description).replaceAll("\n", "<br>")}</p>`,
      handle,
      status: "DRAFT",
      tags: ["layu-market", shopifyDraftOwnershipTag(payload.listingId), tag, contentTag(payload)]
    },
    media: [...payload.photos].sort((a, b) => a.position - b.position).map((photo) => ({
      originalSource: photo.url, alt: photo.altText, mediaContentType: "IMAGE"
    }))
  }, true, fetcher);
  const createResult = object(created.productCreate);
  const product = object(createResult?.product);
  if (!Array.isArray(createResult?.userErrors)) {
    throw new CrossListingConnectorError("Shopify returned an incomplete draft result. Review the product before sending again.", true);
  }
  if (createResult.userErrors.length) {
    throw new CrossListingConnectorError("Shopify rejected part of the draft. Review the product details in Shopify.", Boolean(product));
  }
  const initialVariants = product ? variants(product) : [];
  const variantId = initialVariants[0]?.id;
  if (!product || !ownedDraft(product, handle, tag) || initialVariants.length !== 1 || initialVariants[0].inventoryQuantity !== 0 ||
    typeof variantId !== "string" || !/^gid:\/\/shopify\/ProductVariant\/\d+$/u.test(variantId)) {
    throw new CrossListingConnectorError("Shopify may have created an incomplete draft. Review it before sending again.", true);
  }
  // Creating a draft is already a side effect. Any later failure needs review, even a definite validation error.
  try {
    const updated = await shopifyRequest(config, UPDATE_VARIANT, {
      productId: product.id,
      variants: [{ id: variantId, price: centsToDollars(payload.priceCents), inventoryPolicy: "DENY", inventoryItem: { sku: payload.sku, tracked: true } }]
    }, true, fetcher);
    const updateResult = object(updated.productVariantsBulkUpdate);
    const completed = object(updateResult?.product);
    if (!Array.isArray(updateResult?.userErrors) || updateResult.userErrors.length || !completed || !completedDraft(completed, handle, tag, payload)) {
      throw new CrossListingConnectorError("Shopify created a draft but could not confirm its price and zero stock. Review it before sending again.", true);
    }
    return shopifyResult(completed, config.shop);
  } catch {
    throw new CrossListingConnectorError("Shopify created a draft but did not confirm all its details. Review it before sending again.", true);
  }
}

/** Caller must persist/lock the attempt before invoking this function; never blindly retry an uncertain result. */
export async function publishCrossListingPackage(payload: CrossListingPackage, idempotencyKey: string, options: ConnectorOptions = {}): Promise<DirectPublicationResult> {
  assertPackage(payload, idempotencyKey);
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? fetch;
  if (payload.channel === "facebook_page") return postFacebook(payload, env, fetcher);
  if (payload.channel === "shopify") return createShopifyDraft(payload, idempotencyKey, env, fetcher);
  throw new CrossListingConnectorError("This destination uses the prepared listing and manual posting workflow.");
}
