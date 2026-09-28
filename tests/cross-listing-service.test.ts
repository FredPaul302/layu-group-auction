import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFind: vi.fn(), rowsFind: vi.fn(), count: vi.fn(), upsert: vi.fn(), update: vi.fn(), transaction: vi.fn(),
  connection: vi.fn(), publish: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  listing: { findMany: mocks.listingFind }, crossListing: { findMany: mocks.rowsFind, count: mocks.count, upsert: mocks.upsert, updateMany: mocks.update }, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: () => ({ app: { url: "https://market.layu.llc" } }) }));
vi.mock("../src/lib/cross-listing/connectors", async (original) => ({ ...await original<typeof import("../src/lib/cross-listing/connectors")>(), getDirectConnectionStatus: mocks.connection, publishCrossListingPackage: mocks.publish }));

import { actOnCrossListing, crossListingExternalUrl, crossListingOverrides, crossListingView, getCrossListingRows, listCrossListings, prepareCrossListings } from "../src/lib/cross-listing/service";
import { buildCrossListingPackage, type CrossListingSource } from "../src/lib/cross-listing/package";
import { CrossListingConnectorError } from "../src/lib/cross-listing/connectors";
import type { CrossListingChannel } from "../src/lib/cross-listing/channels";

type Row = Parameters<typeof crossListingView>[0];
type Where = { id?: { in: string[] } | string; sellerUserId?: string; listingId?: { in: string[] }; status?: string; version?: number };
const source: CrossListingSource & { sellerUserId: string } = {
  id: "clisting123", sellerUserId: "seller", title: "Vase", description: "Blue ceramic vase", conditionNote: "Used, good condition", sku: "VASE-1",
  listingType: "fixed_price", status: "published", fixedPriceCents: 1250, images: [{ publicUrl: "https://example.com/vase.jpg", sortOrder: 0 }],
};
let rows: Row[];
let listings: (CrossListingSource & { sellerUserId: string })[];
function row(channel: CrossListingChannel = "facebook_page", patch: Partial<Row> = {}): Row {
  const snapshot = buildCrossListingPackage({ listing: source, channel, siteUrl: "https://market.layu.llc" });
  return { id: "record1", sellerUserId: "seller", listingId: source.id, channel, status: "ready", version: 1, snapshot,
    sourceHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), overrides: {}, externalId: null, externalUrl: null, lastError: null,
    createdAtUtc: new Date(), updatedAtUtc: new Date(), listing: structuredClone(source), ...patch } as Row;
}
function matches(record: Row, where: Where) {
  return (!where.sellerUserId || record.sellerUserId === where.sellerUserId) && (!where.id || (typeof where.id === "string" ? record.id === where.id : where.id.in.includes(record.id))) &&
    (!where.listingId || Boolean(record.listingId && where.listingId.in.includes(record.listingId))) && (!where.status || record.status === where.status) && (!where.version || record.version === where.version);
}
function applyUpdate({ where, data }: { where: Where; data: Omit<Partial<Row>, "version"> & { version?: number | { increment: number } } }) {
  const target = rows.find((record) => matches(record, where));
  if (!target) return { count: 0 };
  const { version, ...rest } = data;
  Object.assign(target, rest, { version: typeof version === "object" ? target.version + version.increment : version ?? target.version });
  return { count: 1 };
}
const send = (version = 1) => actOnCrossListing({ sellerUserId: "seller", id: "record1", action: "send", version, checked: true });

beforeEach(() => {
  vi.resetAllMocks(); rows = [row()]; listings = [structuredClone(source)];
  mocks.rowsFind.mockImplementation(({ where }: { where: Where }) => Promise.resolve(structuredClone(rows.filter((record) => matches(record, where)))));
  mocks.count.mockImplementation(({ where }: { where: Where }) => Promise.resolve(rows.filter((record) => matches(record, where)).length));
  mocks.listingFind.mockImplementation(({ where }: { where: { id: { in: string[] }; sellerUserId: string } }) => Promise.resolve(listings.filter((item) => item.sellerUserId === where.sellerUserId && where.id.in.includes(item.id))));
  mocks.update.mockImplementation(applyUpdate);
  mocks.upsert.mockImplementation(({ create }: { create: Omit<Row, "id" | "listing" | "version" | "createdAtUtc" | "updatedAtUtc" | "externalId" | "externalUrl" | "lastError"> }) => {
    const existing = rows.find((item) => item.listingId === create.listingId && item.channel === create.channel);
    if (!existing) rows.push(row(create.channel as CrossListingChannel, { ...create, id: `record${rows.length + 1}` }));
    return Promise.resolve(existing ?? rows.at(-1));
  });
  mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({ listing: { findMany: mocks.listingFind }, crossListing: { upsert: mocks.upsert } }));
  mocks.connection.mockReturnValue({ ready: true });
  mocks.publish.mockResolvedValue({ externalId: "123_456", url: "https://www.facebook.com/123/posts/456", externalStatus: "posted" });
});

describe("cross-listing ownership and preparation", () => {
  it("does not return another seller's records or prepare their listings", async () => {
    await expect(getCrossListingRows("other", ["record1"])).rejects.toThrow("not found");
    expect(await listCrossListings("other")).toEqual({ rows: [], total: 0 });
    await expect(prepareCrossListings({ sellerUserId: "other", listingIds: [source.id], channels: ["mercari"] })).rejects.toThrow("unavailable");
    expect(mocks.upsert).not.toHaveBeenCalled();
    await expect(actOnCrossListing({ sellerUserId: "other", id: "record1", version: 1, action: "mark_posted", externalUrl: "https://www.facebook.com/item/1" })).rejects.toThrow("not found");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("prepares multiple destinations without publishing and preserves an existing edited external record", async () => {
    rows = [row("facebook_page", { status: "posted", overrides: { title: "Seller's external title" }, externalId: "123_456", externalUrl: "https://www.facebook.com/123/posts/456", version: 5 })];
    const before = structuredClone(rows[0]);
    const input = { sellerUserId: "seller", listingIds: [source.id], channels: ["facebook_page", "mercari"] };
    expect(await prepareCrossListings(input)).toEqual({ count: 2 });
    expect(await prepareCrossListings(input)).toEqual({ count: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(before);
    expect(rows[1]).toMatchObject({ channel: "mercari", status: "ready", externalId: null });
    expect(mocks.upsert.mock.calls.every(([args]) => Object.keys(args.update).length === 0)).toBe(true);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("keeps auction item copies blocked instead of claiming an external post", async () => {
    rows = []; listings = [{ ...source, listingType: "auction", fixedPriceCents: 9900 }];
    await prepareCrossListings({ sellerUserId: "seller", listingIds: [source.id], channels: ["mercari", "shopify"] });
    expect(rows.map((item) => item.status)).toEqual(["blocked", "blocked"]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("rejects unsupported destinations and excessive selections", async () => {
    await expect(prepareCrossListings({ sellerUserId: "seller", listingIds: [source.id], channels: ["made_up"] })).rejects.toThrow("supported destination");
    await expect(getCrossListingRows("seller", Array.from({ length: 101 }, (_, index) => `${index}`))).rejects.toThrow("1 and 100");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("cross-listing edits and references", () => {
  it("converts decimal dollars to exact cents and trims destination text", () => {
    expect(crossListingOverrides({ title: " Vase ", description: " Item ", conditionNote: " Used ", price: "21.49" })).toEqual({ title: "Vase", description: "Item", conditionNote: "Used", priceCents: 2149 });
    expect(crossListingOverrides({ title: "Vase", description: "Item", conditionNote: "Used", price: "" })).not.toHaveProperty("priceCents");
  });

  it.each(["1.001", "-1.00", "$12.50", "0", "1e2", 12.5, null])("rejects invalid money input %s", (price) => {
    expect(() => crossListingOverrides({ title: "Vase", description: "Item", conditionNote: "Used", price })).toThrow("dollars");
  });

  it("validates fields and length before saving", () => {
    expect(() => crossListingOverrides(null)).toThrow("details");
    expect(() => crossListingOverrides({ title: "a".repeat(201), description: "d", conditionNote: "c", price: "1.00" })).toThrow("200 characters");
  });

  it("accepts legitimate destination URLs and rejects misleading hosts, credentials, protocols and ports", () => {
    expect(crossListingExternalUrl("craigslist", " https://newyork.craigslist.org/brk/fuo/d/item/1.html ")).toContain("newyork.craigslist.org");
    expect(crossListingExternalUrl("shopify", "https://admin.shopify.com/store/layu/products/1")).toContain("admin.shopify.com");
    for (const url of ["https://facebook.com.evil.test/item/1", "https://evilfacebook.com/item/1", "https://user:secret@facebook.com/item/1", "http://facebook.com/item/1", "javascript:alert(1)", "https://facebook.com:8443/item/1", "https://mercari.com/item/1"]) {
      expect(() => crossListingExternalUrl("facebook_marketplace", url)).toThrow();
    }
  });

  it("saves destination edits with a version check and leaves the website listing intact", async () => {
    await actOnCrossListing({ sellerUserId: "seller", id: "record1", version: 1, action: "save", fields: { title: "External vase", description: "External description", conditionNote: "Small mark", price: "19.99" } });
    expect(rows[0].version).toBe(2);
    expect(rows[0].overrides).toMatchObject({ priceCents: 1999, title: "External vase" });
    expect(rows[0].listing).toEqual(source);
    expect(mocks.update.mock.calls[0][0].where).toMatchObject({ sellerUserId: "seller", version: 1, status: "ready" });
  });
});

describe("cross-listing publication state", () => {
  it("rejects stale versions and unchecked publication without calling the destination", async () => {
    await expect(send(2)).rejects.toThrow("another window");
    await expect(actOnCrossListing({ sellerUserId: "seller", id: "record1", action: "send", version: 1 })).rejects.toThrow("confirm");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("blocks changed or reserved source items until reviewed", async () => {
    rows[0].listing = { ...source, status: "sold_pending_payment" };
    expect(crossListingView(rows[0])).toMatchObject({ sourceChanged: true, canSend: false });
    await expect(send()).rejects.toThrow("Review");
    await expect(actOnCrossListing({ sellerUserId: "seller", id: "record1", action: "mark_posted", version: 1, externalUrl: "https://www.facebook.com/1/posts/2" })).rejects.toThrow("Refresh");
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("only one concurrent sender can claim the record", async () => {
    const results = await Promise.allSettled([send(), send()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: "posted", version: 3, externalId: "123_456" });
  });

  it("records a Shopify draft as a draft, never as a live listing", async () => {
    rows = [row("shopify")];
    mocks.publish.mockResolvedValue({ externalStatus: "draft", externalId: "gid://shopify/Product/7", url: "https://layu.myshopify.com/admin/products/7" });
    expect((await send()).message).toContain("not published");
    expect(rows[0]).toMatchObject({ status: "external_draft", externalId: "gid://shopify/Product/7" });
  });

  it("stores an uncertain attempt for review and refuses automatic or blind resubmission", async () => {
    mocks.publish.mockRejectedValue(new CrossListingConnectorError("Check your destination after the timeout.", true));
    await expect(send()).rejects.toThrow("timeout");
    expect(rows[0]).toMatchObject({ status: "review", version: 3 });
    await expect(send(3)).rejects.toThrow("Review");
    await expect(actOnCrossListing({ sellerUserId: "seller", id: "record1", version: 3, action: "not_created" })).rejects.toThrow("confirm");
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    await actOnCrossListing({ sellerUserId: "seller", id: "record1", version: 3, action: "not_created", checked: true });
    expect(rows[0]).toMatchObject({ status: "error", version: 4 });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("treats a failed result save as uncertain and never repeats the external call", async () => {
    mocks.update.mockImplementationOnce(applyUpdate).mockResolvedValueOnce({ count: 0 }).mockImplementationOnce(applyUpdate);
    await expect(send()).rejects.toThrow("may have received");
    expect(rows[0].status).toBe("review");
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("does not expose unexpected upstream exception text", async () => {
    mocks.publish.mockRejectedValue(new Error("private access token SECRET"));
    await expect(send()).rejects.toThrow("destination may have received");
    expect(rows[0].lastError).not.toContain("SECRET");
  });

  it("requires explicit external removal and retains a deleted source's tracking record", async () => {
    rows = [row("mercari", { listing: null, listingId: null, status: "posted", externalUrl: "https://www.mercari.com/us/item/1/" })];
    expect(crossListingView(rows[0])).toMatchObject({ editable: false, needsRemoval: true });
    await expect(actOnCrossListing({ sellerUserId: "seller", id: "record1", version: 1, action: "mark_removed" })).rejects.toThrow("Confirm");
    await actOnCrossListing({ sellerUserId: "seller", id: "record1", version: 1, action: "mark_removed", checked: true });
    expect(rows[0]).toMatchObject({ status: "removed", externalUrl: "https://www.mercari.com/us/item/1/" });
  });
});
