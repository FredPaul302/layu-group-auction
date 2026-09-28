import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { listingBatchIds, manageListingBatch } from "../src/lib/catalog/batch-operations";

const now = new Date("2026-09-16T12:00:00Z");
function listing(id = "one") {
  return { id, sellerUserId: "seller", title: id, status: "draft", description: "A useful item", categoryId: "cat", listingType: "auction",
    fulfillmentMode: "pickup_only", shippingFeeCents: 0, fixedPriceCents: null, inventoryAllocation: null as unknown,
    category: { isEnabled: true, minimumStartBidCents: 100, minimumBidIncrementCents: 100 }, images: [{ id: "image" }], orders: [] as { id: string }[],
    auction: { id: `auction-${id}`, startingBidCents: 1000, endAtUtc: new Date("2099-09-26T12:00:00Z"), _count: { bids: 0, runnerUpOffers: 0 } } };
}
function setup(rows = [listing()]) {
  const tx = { listing: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn(), delete: vi.fn() }, auction: { update: vi.fn() },
    inventoryAllocation: { delete: vi.fn() }, inventoryItem: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, inventoryMovement: { create: vi.fn() } };
  db.$transaction.mockImplementation(async (work) => work(tx)); return tx;
}
beforeEach(() => vi.resetAllMocks());
describe("bulk publishing and deletion", () => {
  it("publishes the whole selection with one UTC start and preserves the shared ending", async () => {
    const tx = setup([listing("one"), listing("two")]);
    expect(await manageListingBatch({ ids: ["one", "two"], action: "publish", sellerUserId: "seller", now })).toEqual({ count: 2 });
    expect(tx.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["one", "two"] }, sellerUserId: "seller" } }));
    expect(tx.listing.update).toHaveBeenCalledTimes(2);
    expect(tx.auction.update).toHaveBeenCalledWith({ where: { id: "auction-one" }, data: { status: "live", startAtUtc: now } });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });
  it.each(["draft", "published", "unsold", "archived"])("deletes an unused %s listing", async (status) => {
    const row = listing(); row.status = status; const tx = setup([row]);
    expect(await manageListingBatch({ ids: ["one"], action: "delete", sellerUserId: "seller" })).toEqual({ count: 1 });
    expect(tx.listing.delete).toHaveBeenCalledWith({ where: { id: "one" } });
  });
  it.each(["bids", "runnerUpOffers"] as const)("preserves all %s history and rejects the whole selection", async (history) => {
    const row = listing("two"); row.auction._count[history] = 1; const tx = setup([listing(), row]);
    await expect(manageListingBatch({ ids: ["one", "two"], action: "delete", sellerUserId: "seller" })).rejects.toMatchObject({ code: "listing_has_history" });
    expect(tx.listing.delete).not.toHaveBeenCalled();
  });
  it("preserves any order history, including cancelled orders", async () => {
    const row = listing(); row.orders = [{ id: "cancelled-order" }]; const tx = setup([row]);
    await expect(manageListingBatch({ ids: ["one"], action: "delete", sellerUserId: "seller" })).rejects.toMatchObject({ code: "listing_has_history" });
    expect(tx.listing.delete).not.toHaveBeenCalled();
  });
  it("does not expose or mutate another seller's listing", async () => {
    const tx = setup([]); await expect(manageListingBatch({ ids: ["private"], action: "delete", sellerUserId: "seller" })).rejects.toMatchObject({ code: "listing_not_found" });
    expect(tx.listing.delete).not.toHaveBeenCalled();
  });
  it.each(["category", "photo", "description", "price", "expired", "already-published"])("rejects an invalid %s row before publishing any row", async (problem) => {
    const row = listing("two");
    if (problem === "category") row.category.isEnabled = false;
    if (problem === "photo") row.images = [];
    if (problem === "description") row.description = "";
    if (problem === "price") row.auction.startingBidCents = 0;
    if (problem === "expired") row.auction.endAtUtc = new Date("2000-01-01Z");
    if (problem === "already-published") row.status = "published";
    const tx = setup([listing(), row]);
    await expect(manageListingBatch({ ids: ["one", "two"], action: "publish", sellerUserId: "seller" })).rejects.toBeInstanceOf(Error);
    expect(tx.listing.update).not.toHaveBeenCalled();
  });
  it("releases unused inventory and retains its audit record on deletion", async () => {
    const row = listing(); row.inventoryAllocation = { id: "allocation", unitCostCents: 800, item: { id: "stock" } };
    const tx = setup([row]); tx.inventoryItem.findUniqueOrThrow.mockResolvedValue({ id: "stock", quantity: 3, unitCostCents: 1000, _count: { allocations: 1 } });
    await manageListingBatch({ ids: ["one"], action: "delete", sellerUserId: "seller" });
    expect(tx.inventoryAllocation.delete).toHaveBeenCalledWith({ where: { id: "allocation" } });
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "stock" }, data: { unitCostCents: 933 } });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "listing_released", reference: "one", quantityDelta: 0 }) }));
  });
  it("retries a concurrent change, then rejects a newly arrived bid", async () => {
    const row = listing(); row.auction._count.bids = 1; const tx = setup([row]);
    db.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("race", { code: "P2034", clientVersion: "test" }));
    await expect(manageListingBatch({ ids: ["one"], action: "delete", sellerUserId: "seller" })).rejects.toMatchObject({ code: "listing_has_history" });
    expect(tx.listing.delete).not.toHaveBeenCalled();
  });
  it("reports a bid foreign-key restriction as a safe concurrent-change failure", async () => {
    setup(); db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("bid exists", { code: "P2003", clientVersion: "test" }));
    await expect(manageListingBatch({ ids: ["one"], action: "delete", sellerUserId: "seller" })).rejects.toMatchObject({ code: "listing_state_changed" });
  });
  it.each([[], null, [123], Array.from({ length: 101 }, (_, i) => String(i))])("rejects invalid selection %j", (ids) => expect(() => listingBatchIds(ids)).toThrow());
  it("deduplicates repeated listing IDs", () => expect(listingBatchIds(["one", "one"])).toEqual(["one"]));
});
