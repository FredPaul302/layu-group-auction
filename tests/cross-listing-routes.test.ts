import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), prepare: vi.fn(), action: vi.fn(), rows: vi.fn(), view: vi.fn(), record: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: mocks.user }));
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: () => ({ app: { url: "https://market.layu.llc" } }) }));
vi.mock("@/lib/cross-listing/service", () => ({
  CrossListingError: class CrossListingError extends Error {}, prepareCrossListings: mocks.prepare, actOnCrossListing: mocks.action,
  getCrossListingRows: mocks.rows, crossListingView: mocks.view,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { crossListing: { findFirst: mocks.record } } }));
vi.mock("@/lib/storage/server", () => ({ getStorageAdapter: () => ({ read: mocks.read }) }));

import { POST as prepare } from "../src/app/api/admin/cross-listing/route";
import { POST as action } from "../src/app/api/admin/cross-listing/[id]/route";
import { GET as download } from "../src/app/api/admin/cross-listing/download/route";
import { GET as photos } from "../src/app/api/admin/cross-listing/[id]/photos/route";
import { CrossListingError } from "../src/lib/cross-listing/service";
import { buildCrossListingPackage } from "../src/lib/cross-listing/package";

const origin = "https://market.layu.llc";
const context = { params: Promise.resolve({ id: "record1" }) };
function request(path = "", method = "GET", body?: string, from: string | null = origin) {
  return new NextRequest(`${origin}/api/admin/cross-listing${path}`, { method, headers: from === null ? {} : { Origin: from }, body });
}
const payload = buildCrossListingPackage({ channel: "shopify", siteUrl: origin, listing: {
  id: "clisting123", title: "Vase", sku: "VASE-1", description: "Blue vase", conditionNote: "Used", status: "published", listingType: "fixed_price",
  fixedPriceCents: 1299, images: [{ publicUrl: `${origin}/photo.jpg`, sortOrder: 0 }],
} });
const readyView = { item: payload, sourceChanged: false, needsRemoval: false, issues: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "seller", role: "admin", emailVerifiedAtUtc: new Date() });
  mocks.prepare.mockResolvedValue({ count: 2 }); mocks.action.mockResolvedValue({ message: "Destination details saved." });
  mocks.rows.mockResolvedValue([{ id: "record1" }]); mocks.view.mockReturnValue(readyView);
  mocks.record.mockResolvedValue({ listing: { images: [{ storageKey: "listings/vase.jpg" }] } });
  mocks.read.mockResolvedValue({ body: Buffer.from("photo-file-bytes") });
});

describe("cross-listing route access", () => {
  it.each([null, { id: "buyer", role: "bidder" }])("requires an administrator for every operation: %s", async (user) => {
    mocks.user.mockResolvedValue(user);
    const responses = await Promise.all([
      prepare(request("", "POST", "{}")), action(request("/record1", "POST", "{}"), context),
      download(request("/download?ids=record1")), photos(request("/record1/photos"), context),
    ]);
    expect(responses.map((response) => response.status)).toEqual([303, 303, 303, 303]);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.rows).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(["https://attacker.test", "https://market.layu.llc.attacker.test", null])("rejects mutation origin %s before authentication", async (from) => {
    expect((await prepare(request("", "POST", "{}", from))).status).toBe(403);
    expect((await action(request("/record1", "POST", "{}", from), context)).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.action).not.toHaveBeenCalled();
  });

  it("uses session ownership instead of submitted seller IDs", async () => {
    await prepare(request("", "POST", JSON.stringify({ sellerUserId: "attacker", listingIds: ["listing1"], channels: ["mercari"] })));
    expect(mocks.prepare).toHaveBeenCalledWith({ sellerUserId: "seller", listingIds: ["listing1"], channels: ["mercari"] });
    await action(request("/record1", "POST", JSON.stringify({ sellerUserId: "attacker", id: "foreign", version: 3, action: "send", checked: true })), context);
    expect(mocks.action).toHaveBeenCalledWith(expect.objectContaining({ sellerUserId: "seller", id: "record1", version: 3, action: "send", checked: true }));
    await download(request("/download?ids=record1,record2&format=json"));
    expect(mocks.rows).toHaveBeenCalledWith("seller", ["record1", "record2"]);
  });
});

describe("cross-listing mutation results", () => {
  it("describes preparation without claiming items were posted", async () => {
    const response = await prepare(request("", "POST", JSON.stringify({ listingIds: ["listing1"], channels: ["mercari", "ebay"] })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ count: 2, message: expect.stringContaining("Nothing has been posted yet") });
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid action bodies before service work", async () => {
    expect((await prepare(request("", "POST", "{"))).status).toBe(422);
    expect((await action(request("/record1", "POST", "{"), context)).status).toBe(422);
    expect((await action(request("/record1", "POST", "null"), context)).status).toBe(422);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.action).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])("rejects oversized streamed JSON with content-length %s before service work", async (contentLength) => {
    for (const invoke of [prepare, (input: NextRequest) => action(input, context)]) {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from(`{"description":"${"x".repeat(70 * 1024)}`));
          controller.enqueue(Buffer.from(`${"x".repeat(70 * 1024)}"}`));
        },
        cancel,
      });
      const input = new NextRequest(`${origin}/api/admin/cross-listing`, {
        method: "POST", body: stream, duplex: "half",
        headers: { Origin: origin, ...(contentLength === undefined ? {} : { "Content-Length": contentLength }) },
      } as ConstructorParameters<typeof NextRequest>[1]);
      const response = await invoke(input);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ message: expect.stringContaining("too large") });
      expect(cancel).toHaveBeenCalledTimes(1);
    }
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.action).not.toHaveBeenCalled();
  });

  it("preserves actionable domain errors without exposing unexpected server details", async () => {
    mocks.action.mockRejectedValueOnce(new CrossListingError("The item changed in another window."));
    const conflict = await action(request("/record1", "POST", '{"action":"send","version":1}'), context);
    expect(conflict.status).toBe(422); expect(await conflict.json()).toEqual({ message: "The item changed in another window." });
    mocks.action.mockRejectedValueOnce(new Error("private token SECRET"));
    const failure = await action(request("/record1", "POST", '{"action":"send","version":1}'), context);
    expect(failure.status).toBe(500); expect(await failure.text()).not.toContain("SECRET");
    expect(mocks.action).toHaveBeenCalledTimes(2);
  });
});

describe("cross-listing exports", () => {
  it("downloads only ready current records and marks responses private", async () => {
    const response = await download(request("/download?ids=record1&format=json"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.json()).toMatchObject({ published: false, currency: "USD", items: [{ listingId: "clisting123", priceDollars: "12.99" }] });
  });

  it.each([
    { ...readyView, sourceChanged: true }, { ...readyView, needsRemoval: true },
    { ...readyView, issues: ["Review changed price"] }, { ...readyView, item: { ...payload, ready: false } },
  ])("does not export stale, unavailable, or blocked records", async (view) => {
    mocks.view.mockReturnValue(view);
    expect((await download(request("/download?ids=record1&format=json"))).status).toBe(422);
  });

  it("exports Shopify drafts with dollar amounts and no sellable stock", async () => {
    const response = await download(request("/download?ids=record1&format=shopify"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain('"false","draft"'); expect(body).toContain('"12.99","shopify","0","deny"');
  });

  it("does not leak missing records or storage keys", async () => {
    mocks.rows.mockRejectedValue(new Error("foreign record secret"));
    const response = await download(request("/download?ids=foreign"));
    expect(response.status).toBe(422); expect(await response.text()).not.toContain("secret");
    mocks.record.mockResolvedValue(null);
    expect((await photos(request("/record1/photos"), context)).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("scopes image archives to the signed-in seller and streams a real ZIP", async () => {
    const response = await photos(request("/record1/photos"), context);
    expect(mocks.record.mock.calls[0][0].where).toEqual({ id: "record1", sellerUserId: "seller" });
    expect(mocks.record.mock.calls[0][0].select.listing.select.images.orderBy).toEqual([{ isPrimary: "desc" }, { sortOrder: "asc" }]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/zip");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.includes(Buffer.from("01-photo.jpg"))).toBe(true);
    expect(bytes.includes(Buffer.from("photo-file-bytes"))).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith("listings/vase.jpg");
  });
});
