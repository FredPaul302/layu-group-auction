import { describe, expect, it } from "vitest";
import { crossListingChannels, isCrossListingChannel } from "../src/lib/cross-listing/channels";
import { buildCrossListingJson, buildCrossListingPackage, buildCrossListingText, buildShopifyDraftCsv, shopifyDraftHandle, shopifyDraftOwnershipTag, type CrossListingSource } from "../src/lib/cross-listing/package";

const listing: CrossListingSource = {
  id: "clisting123", slug: "blue-vase", sku: "VASE-3", title: "Blue vase", description: "Hand-painted, signed vase.",
  conditionNote: "Used; small chip on the base.", listingType: "fixed_price", status: "published", fixedPriceCents: 2149,
  images: [
    { publicUrl: "/uploads/side.jpg", sortOrder: 0, isPrimary: false },
    { publicUrl: "/uploads/front.jpg", sortOrder: 4, isPrimary: true, altText: "Blue vase front" },
  ],
};
const siteUrl = "https://market.layu.llc";
const now = new Date("2026-09-23T12:00:00Z");

describe("cross-listing preparation", () => {
  it("supports separate Facebook surfaces and only known destinations", () => {
    expect(crossListingChannels).toHaveLength(7);
    expect(isCrossListingChannel("facebook_page")).toBe(true);
    expect(isCrossListingChannel("facebook")).toBe(false);
    expect(isCrossListingChannel("__proto__")).toBe(false);
  });

  it("preserves cents, exports dollars, condition, primary-first images and the actual listing URL", () => {
    const result = buildCrossListingPackage({ listing, channel: "facebook_marketplace", siteUrl });
    expect(result.ready).toBe(true);
    expect(result.priceCents).toBe(2149);
    expect(result.priceDollars).toBe("21.49");
    expect(result.websiteUrl).toBe(`${siteUrl}/listings/clisting123`);
    expect(result.description).toContain("Condition: Used; small chip on the base.");
    expect(result.description).not.toContain(siteUrl);
    expect(result.photos.map((photo) => photo.url)).toEqual([`${siteUrl}/uploads/front.jpg`, `${siteUrl}/uploads/side.jpg`]);
    expect(result.photos.map((photo) => photo.position)).toEqual([1, 2]);
    expect(result.warnings.join(" ")).toContain("not synchronized");
    expect(listing.images[0].isPrimary).toBe(false);
  });

  it("applies destination overrides without changing the website source", () => {
    const result = buildCrossListingPackage({ listing, channel: "ebay", siteUrl, overrides: { title: "eBay vase", description: "External copy", priceCents: 2250, conditionNote: "Chipped base" } });
    expect(result).toMatchObject({ title: "eBay vase", priceCents: 2250, priceDollars: "22.50", condition: "Chipped base" });
    expect(result.description).toBe("External copy\n\nCondition: Chipped base");
    expect(listing.title).toBe("Blue vase");
    expect(listing.fixedPriceCents).toBe(2149);
  });

  it.each(crossListingChannels.filter((channel) => channel.id !== "facebook_page"))("blocks auction copies for $label, including auctions with Buy It Now", ({ id }) => {
    const result = buildCrossListingPackage({ listing: { ...listing, listingType: "auction", fixedPriceCents: 9000 }, channel: id, siteUrl });
    expect(result.ready).toBe(false);
    expect(result.priceCents).toBeNull();
    expect(result.blockingReasons.join(" ")).toContain("separately purchasable");
  });

  it("prepares an auction promotion with its precise ending and website link", () => {
    const result = buildCrossListingPackage({ listing: { ...listing, listingType: "auction", auction: { startingBidCents: 100, endAtUtc: "2026-10-03T22:30:00Z", status: "live" } }, channel: "facebook_page", siteUrl, now });
    expect(result.ready).toBe(true);
    expect(result.mode).toBe("promotion");
    expect(result.description).toContain("Starting bid: $1.00.");
    expect(result.description).toContain("Saturday, October 3, 2026 at 6:30 PM EDT");
    expect(result.description).toContain(`${siteUrl}/listings/clisting123`);
  });

  it("formats winter closing times with standard Eastern time and respects an explicit site timezone", () => {
    const auction = { ...listing, listingType: "auction" as const, auction: { endAtUtc: "2026-12-03T22:30:00Z" } };
    expect(buildCrossListingPackage({ listing: auction, channel: "facebook_page", siteUrl, now }).description).toContain("5:30 PM EST");
    expect(buildCrossListingPackage({ listing: auction, channel: "facebook_page", siteUrl, now, timeZone: "America/Los_Angeles" }).description).toContain("2:30 PM PST");
  });

  it.each(["draft", "sold_pending_payment", "paid", "archived"])("does not promote a %s listing", (status) => {
    expect(buildCrossListingPackage({ listing: { ...listing, status }, channel: "facebook_page", siteUrl }).ready).toBe(false);
  });

  it("allows fixed-price draft preparation and blocks unavailable stock", () => {
    expect(buildCrossListingPackage({ listing: { ...listing, status: "draft" }, channel: "mercari", siteUrl }).ready).toBe(true);
    expect(buildCrossListingPackage({ listing: { ...listing, status: "sold_pending_payment" }, channel: "mercari", siteUrl }).ready).toBe(false);
  });

  it.each(["2026-09-22T12:00:00Z", "invalid", undefined])("blocks expired or missing auction dates: %s", (endAtUtc) => {
    const result = buildCrossListingPackage({ listing: { ...listing, listingType: "auction", auction: { endAtUtc } }, channel: "facebook_page", siteUrl, now });
    expect(result.ready).toBe(false);
  });

  it("requires an explicit eBay title edit instead of silently truncating", () => {
    const result = buildCrossListingPackage({ listing: { ...listing, title: "v".repeat(81) }, channel: "ebay", siteUrl });
    expect(result.title).toHaveLength(81);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("80 characters");
  });

  it.each([0, -1, 21.49, Number.NaN, 2147483648, null])("blocks invalid fixed prices: %s", (fixedPriceCents) => {
    expect(buildCrossListingPackage({ listing: { ...listing, fixedPriceCents }, channel: "ebay", siteUrl }).ready).toBe(false);
  });

  it("omits private/unsafe photo references and deduplicates valid images", () => {
    const result = buildCrossListingPackage({ listing: { ...listing, images: [
      { publicUrl: "javascript:alert(1)", sortOrder: 0 },
      { publicUrl: "https://user:password@example.com/photo.jpg", sortOrder: 1 },
      { publicUrl: "/api/admin/listings/workspace-media/secret", sortOrder: 2 },
      { publicUrl: "/uploads/safe.jpg", sortOrder: 3 },
      { publicUrl: "/uploads/safe.jpg", sortOrder: 4 },
      { publicUrl: "", sortOrder: 5 },
    ] }, channel: "mercari", siteUrl });
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].url).toBe(`${siteUrl}/uploads/safe.jpg`);
    expect(result.warnings.join(" ")).toContain("omitted");
  });

  it("does not claim generic text or JSON is published or a marketplace import file", () => {
    const result = buildCrossListingPackage({ listing, channel: "craigslist", siteUrl });
    expect(buildCrossListingText(result)).toContain("Prepared only; this file does not publish anything.");
    expect(JSON.parse(buildCrossListingJson([result]))).toMatchObject({ format: "layu-cross-listing-preparation-v1", currency: "USD", published: false });
  });
});

describe("Shopify draft CSV", () => {
  it("uses decimal dollar prices, stable handles, dependent option columns, draft status and zero stock", () => {
    const result = buildCrossListingPackage({ listing, channel: "shopify", siteUrl });
    const csv = buildShopifyDraftCsv([result]);
    expect(csv).toContain('"Option1 name","Option1 value","Price","Inventory tracker","Inventory quantity"');
    expect(csv).toContain('"false","draft","VASE-3","Title","Default Title","21.49","shopify","0","deny","manual"');
    expect(csv).toContain('"layu-clisting123"');
    expect(csv).toContain('"layu-listing-clisting123"');
    expect(csv).toContain(`${siteUrl}/uploads/front.jpg","1","Blue vase front"`);
    expect(csv).toContain(`${siteUrl}/uploads/side.jpg","2","Blue vase"`);
    expect(csv.split("\n").filter(Boolean)).toHaveLength(3);
  });

  it("uses shared Shopify identities without lossy case or punctuation collisions", () => {
    expect(shopifyDraftHandle("clisting123")).toBe("layu-clisting123");
    expect(shopifyDraftOwnershipTag("clisting123")).toBe("layu-listing-clisting123");
    expect(() => shopifyDraftHandle("CListing123")).toThrow("stable listing ID");
    expect(() => shopifyDraftHandle("listing/123")).toThrow("stable listing ID");
  });

  it("escapes HTML, CSV quotes and spreadsheet formulas without changing the source content", () => {
    const result = buildCrossListingPackage({ listing: { ...listing, title: '=HYPERLINK("https://example.com")', sku: "\t=1+1", description: '<script>alert("x")</script>\nA & B' }, channel: "shopify", siteUrl });
    const csv = buildShopifyDraftCsv([result]);
    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>A &amp; B");
    expect(result.title).toBe('=HYPERLINK("https://example.com")');
  });

  it("rejects unready, other-channel or repeated packages", () => {
    const ready = buildCrossListingPackage({ listing, channel: "shopify", siteUrl });
    expect(() => buildShopifyDraftCsv([ready, ready])).toThrow("only once");
    expect(() => buildShopifyDraftCsv([{ ...ready, ready: false }])).toThrow("Only ready");
    expect(() => buildShopifyDraftCsv([{ ...ready, channel: "ebay" }])).toThrow("Only ready");
    expect(() => buildShopifyDraftCsv([{ ...ready, mode: "promotion" }])).toThrow("Only ready");
  });

  it("rejects non-HTTPS photos for Shopify import", () => {
    expect(buildCrossListingPackage({ listing: { ...listing, images: [{ publicUrl: "http://example.com/photo.jpg", sortOrder: 0 }] }, channel: "shopify", siteUrl }).ready).toBe(false);
  });
});
