import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  CrossListingConnectorError,
  getDirectConnectionStatus,
  publishCrossListingPackage
} from "../src/lib/cross-listing/connectors";
import type { CrossListingPackage } from "../src/lib/cross-listing/package";

const env = {
  FACEBOOK_PAGE_ID: "12345",
  FACEBOOK_PAGE_ACCESS_TOKEN: "private-page-token",
  FACEBOOK_GRAPH_API_VERSION: "v26.0",
  SHOPIFY_SHOP_DOMAIN: "layu-test.myshopify.com",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "private-shopify-token"
};
const key = "listing-1:shopify";
const digest = createHash("sha256").update(key).digest("hex");
const handle = "layu-listing-1";
const ownership = `layu-export-${digest}`;

function payload(channel: CrossListingPackage["channel"] = "shopify"): CrossListingPackage {
  return {
    listingId: "listing-1", channel, title: "Vintage lamp", description: "Good condition.\nReview the photos.",
    condition: "good", priceCents: 2149, priceDollars: "21.49", sku: "LAYU-001",
    websiteUrl: "https://market.layu.llc/listings/listing-1", mode: channel === "facebook_page" ? "promotion" : "item",
    photos: [{ url: "https://market.layu.llc/uploads/photo.jpg", position: 0, altText: "Lamp" }],
    ready: true, warnings: [], blockingReasons: []
  };
}

function product(complete = true, input = payload()) {
  const fingerprint = createHash("sha256").update(JSON.stringify({
    title: input.title, description: input.description, priceCents: input.priceCents, sku: input.sku,
    websiteUrl: input.websiteUrl, photos: input.photos
  })).digest("hex");
  return {
    id: "gid://shopify/Product/123", handle, tags: [ownership, `layu-content-${fingerprint}`], status: "DRAFT",
    variants: { nodes: [{
      id: "gid://shopify/ProductVariant/456", price: complete ? "21.49" : "0.00", inventoryQuantity: 0,
      inventoryPolicy: "DENY", inventoryItem: { sku: complete ? "LAYU-001" : "", tracked: complete }
    }] }
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function mockedFetch(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  return fetcher;
}

describe("cross-listing connection setup", () => {
  it("returns only safe readiness information and requires explicit Page API version", () => {
    expect(getDirectConnectionStatus("facebook_page", env).ready).toBe(true);
    expect(getDirectConnectionStatus("shopify", env).ready).toBe(true);
    expect(getDirectConnectionStatus("facebook_page", { ...env, FACEBOOK_GRAPH_API_VERSION: "" }).ready).toBe(false);
    expect(getDirectConnectionStatus("facebook_marketplace", env).ready).toBe(false);
    expect(JSON.stringify(getDirectConnectionStatus("facebook_page", env))).not.toContain(env.FACEBOOK_PAGE_ACCESS_TOKEN);
  });

  it.each([
    "https://layu.myshopify.com", "layu.myshopify.com.evil.test", "layu.myshopify.com:443", "127.0.0.1",
    "layu.myshopify.com@evil.test", "a.b.myshopify.com", "layu.myshopify.com/path", "layu.myshopify.com\n.evil.test"
  ])("rejects arbitrary Shopify request targets: %s", async (domain) => {
    const source = { ...env, SHOPIFY_SHOP_DOMAIN: domain };
    const fetcher = mockedFetch();
    expect(getDirectConnectionStatus("shopify", source).ready).toBe(false);
    await expect(publishCrossListingPackage(payload(), key, { env: source, fetch: fetcher })).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects blocked packages before any network operation", async () => {
    const fetcher = mockedFetch();
    await expect(publishCrossListingPackage({ ...payload(), ready: false, blockingReasons: ["Auction"] }, key, { env, fetch: fetcher }))
      .rejects.toBeInstanceOf(CrossListingConnectorError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Facebook business Page promotions", () => {
  it("posts a link to the configured Page and keeps its token out of URLs, bodies and results", async () => {
    const fetcher = mockedFetch(json({ id: "12345_67890" }));
    const result = await publishCrossListingPackage(payload("facebook_page"), "page:listing-1", { env, fetch: fetcher });
    expect(result).toEqual({ externalId: "12345_67890", url: "https://www.facebook.com/12345/posts/67890", externalStatus: "posted" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v26.0/12345/feed");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${env.FACEBOOK_PAGE_ACCESS_TOKEN}` });
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("link")).toBe(payload().websiteUrl);
    expect(body.get("message")).toContain("Vintage lamp");
    expect(String(url) + body.toString() + JSON.stringify(result)).not.toContain(env.FACEBOOK_PAGE_ACCESS_TOKEN);
  });

  it("marks lost responses uncertain without leaking a raw transport error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`Request contained ${env.FACEBOOK_PAGE_ACCESS_TOKEN}`));
    const error = await publishCrossListingPackage(payload("facebook_page"), key, { env, fetch: fetcher }).catch((err: unknown) => err);
    expect(error).toMatchObject({ uncertain: true });
    expect(String(error)).not.toContain(env.FACEBOOK_PAGE_ACCESS_TOKEN);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([json({}), json({ id: "999_67890" }), new Response("not-json"), json({}, 503)])("does not report an ambiguous response as posted", async (response) => {
    await expect(publishCrossListingPackage(payload("facebook_page"), key, { env, fetch: mockedFetch(response) }))
      .rejects.toMatchObject({ uncertain: true });
  });

  it("reports definite rejected credentials safely", async () => {
    await expect(publishCrossListingPackage(payload("facebook_page"), key, { env, fetch: mockedFetch(json({ error: env.FACEBOOK_PAGE_ACCESS_TOKEN }, 403)) }))
      .rejects.toMatchObject({ uncertain: false });
  });
});

describe("Shopify draft connector", () => {
  it("creates a draft and configures its exact price and SKU without adding stock or publishing", async () => {
    const input = { ...payload(), description: "<script>bad</script>\nLamp & shade" };
    const fetcher = mockedFetch(
      json({ data: { shop: { currencyCode: "USD" }, product: null } }),
      json({ data: { productCreate: { product: product(false, input), userErrors: [] } } }),
      json({ data: { productVariantsBulkUpdate: { product: product(true, input), userErrors: [] } } })
    );
    const result = await publishCrossListingPackage(input, key, { env, fetch: fetcher });
    expect(result).toEqual({ externalId: "gid://shopify/Product/123", url: "https://layu-test.myshopify.com/admin/products/123", externalStatus: "draft" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const requests = fetcher.mock.calls.map(([url, init]) => {
      expect(url).toBe("https://layu-test.myshopify.com/admin/api/2026-07/graphql.json");
      expect(init?.headers).toMatchObject({ "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN });
      expect(init?.redirect).toBe("error");
      expect(String(url) + String(init?.body)).not.toContain(env.SHOPIFY_ADMIN_ACCESS_TOKEN);
      return JSON.parse(init?.body as string);
    });
    expect(requests[0].variables.identifier).toEqual({ handle });
    expect(requests[1].variables.product).toMatchObject({ status: "DRAFT", handle });
    expect(requests[1].variables.product.tags).toEqual(expect.arrayContaining(["layu-market", "layu-listing-listing-1", ownership]));
    expect(requests[1].variables.product.descriptionHtml).toBe("<p>&lt;script&gt;bad&lt;/script&gt;<br>Lamp &amp; shade</p>");
    expect(requests[2].variables.variants).toEqual([{ id: "gid://shopify/ProductVariant/456", price: "21.49", inventoryPolicy: "DENY", inventoryItem: { sku: "LAYU-001", tracked: true } }]);
    expect(JSON.stringify(requests)).not.toMatch(/publishablePublish|inventorySetQuantities|quantityAdjustments/);
  });

  it("recovers an already complete owned draft using a read only lookup", async () => {
    const fetcher = mockedFetch(json({ data: { shop: { currencyCode: "USD" }, product: product() } }));
    expect((await publishCrossListingPackage(payload(), key, { env, fetch: fetcher })).externalStatus).toBe("draft");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires review if prepared content changed after a previous API draft", async () => {
    const fetcher = mockedFetch(json({ data: { shop: { currencyCode: "USD" }, product: product() } }));
    await expect(publishCrossListingPackage({ ...payload(), title: "Updated title" }, key, { env, fetch: fetcher })).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recognizes an imported CSV handle without creating a second product", async () => {
    const imported = { ...product(), tags: ["layu-listing-listing-1"] };
    const fetcher = mockedFetch(json({ data: { shop: { currencyCode: "USD" }, product: imported } }));
    await expect(publishCrossListingPackage(payload(), key, { env, fetch: fetcher })).rejects.toMatchObject({ uncertain: true });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).variables.identifier).toEqual({ handle: "layu-listing-1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...product(), tags: ["someone-else"] },
    { ...product(), status: "ACTIVE" },
    product(false),
    { ...product(), variants: { nodes: [{ ...product().variants.nodes[0], inventoryQuantity: 1 }] } }
  ])("never overwrites an existing foreign, active or incomplete product", async (existing) => {
    const fetcher = mockedFetch(json({ data: { shop: { currencyCode: "USD" }, product: existing } }));
    await expect(publishCrossListingPackage(payload(), key, { env, fetch: fetcher })).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects another currency without silently converting USD prices", async () => {
    const fetcher = mockedFetch(json({ data: { shop: { currencyCode: "CAD" }, product: null } }));
    await expect(publishCrossListingPackage(payload(), key, { env, fetch: fetcher })).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires manual review after creating the product if the variant update fails", async () => {
    const fetcher = mockedFetch(
      json({ data: { shop: { currencyCode: "USD" }, product: null } }),
      json({ data: { productCreate: { product: product(false), userErrors: [] } } }),
      json({ error: `denied ${env.SHOPIFY_ADMIN_ACCESS_TOKEN}` }, 403)
    );
    const error = await publishCrossListingPackage(payload(), key, { env, fetch: fetcher }).catch((err: unknown) => err);
    expect(error).toMatchObject({ uncertain: true });
    expect(String(error)).not.toContain(env.SHOPIFY_ADMIN_ACCESS_TOKEN);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("never creates when the initial lookup is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(publishCrossListingPackage(payload(), key, { env, fetch: fetcher })).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
