import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  return { transaction: vi.fn(), inventoryItem: model(), inventoryPurchaseOrder: model(), inventoryMovement: model(), inventoryAllocation: model(), listing: model() };
});
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
import { adjustInventory, allocateInventory, createPurchaseOrder, receivePurchaseOrder, releaseInventoryAllocation, updateAllocationSellingCost } from "../src/lib/inventory/service";

const sellerUserId = "seller";
const item = { id: "item", sellerUserId, quantity: 4, unitCostCents: 1000, _count: { allocations: 2 } };
const order = { id: "po", sellerUserId, reference: "PO-1", receivedAtUtc: null, lines: [{ sku: "SKU", title: "Item", quantity: 2, unitCostCents: 2000, location: null }] };

describe("inventory service transactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((work) => work(mocks));
    mocks.inventoryItem.findFirst.mockResolvedValue(item);
    mocks.inventoryItem.findUnique.mockResolvedValue(item);
    mocks.inventoryItem.update.mockResolvedValue(item);
    mocks.inventoryItem.create.mockResolvedValue(item);
    mocks.inventoryPurchaseOrder.findFirst.mockResolvedValue(order);
    mocks.inventoryPurchaseOrder.update.mockResolvedValue({ ...order, receivedAtUtc: new Date() });
  });

  it("validates every CSV row before saving a draft or changing stock", async () => {
    await expect(createPurchaseOrder({ sellerUserId, reference: "PO-1", supplier: "Supplier", csv: "sku,title,quantity,unit_cost\nX,Good,2,1.50\nY,Bad,-1,1.50" })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("saves purchase orders as drafts without creating inventory movements", async () => {
    await createPurchaseOrder({ sellerUserId, reference: " PO-1 ", supplier: "Supplier", csv: "sku,title,quantity,unit_cost\nX,Good,2,1.50" });
    expect(mocks.inventoryPurchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reference: "PO-1", sellerUserId, lines: { create: [{ sku: "X", title: "Good", quantity: 2, unitCostCents: 150, location: null }] } }) }));
    expect(mocks.inventoryMovement.create).not.toHaveBeenCalled();
  });
  it("receives all lines atomically and adjusts weighted unassigned cost", async () => {
    await receivePurchaseOrder({ sellerUserId, purchaseOrderId: "po" });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    expect(mocks.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { quantity: 6, unitCostCents: 1500 } });
    expect(mocks.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantityDelta: 2, unitCostCents: 2000, actorUserId: sellerUserId }) });
    expect(mocks.inventoryPurchaseOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { receivedAtUtc: expect.any(Date) } }));
  });
  it("does not receive the same purchase order twice", async () => {
    mocks.inventoryPurchaseOrder.findFirst.mockResolvedValue({ ...order, receivedAtUtc: new Date() });
    await receivePurchaseOrder({ sellerUserId, purchaseOrderId: "po" });
    expect(mocks.inventoryItem.update).not.toHaveBeenCalled();
    expect(mocks.inventoryMovement.create).not.toHaveBeenCalled();
  });
  it("refuses an order outside the seller scope", async () => {
    mocks.inventoryPurchaseOrder.findFirst.mockResolvedValue(null);
    await expect(receivePurchaseOrder({ sellerUserId, purchaseOrderId: "other-po" })).rejects.toThrow(/not found/u);
    expect(mocks.inventoryPurchaseOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other-po", sellerUserId } }));
  });
  it("does not permit reducing stock below allocated units", async () => {
    await expect(adjustInventory({ sellerUserId, itemId: "item", quantityDelta: "-3", unitCost: "", reason: "Damage" })).rejects.toThrow(/assigned/u);
    expect(mocks.inventoryMovement.create).not.toHaveBeenCalled();
  });
  it("requires a reason and integer positive-unit cost before adjustment", async () => {
    await expect(adjustInventory({ sellerUserId, itemId: "item", quantityDelta: "1", unitCost: "1.001", reason: "Found" })).rejects.toThrow();
    await expect(adjustInventory({ sellerUserId, itemId: "item", quantityDelta: "-1", unitCost: "", reason: "" })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("records negative adjustments without requiring a replacement cost", async () => {
    await adjustInventory({ sellerUserId, itemId: "item", quantityDelta: "-1", unitCost: "", reason: "Damaged" });
    expect(mocks.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { quantity: 3, unitCostCents: 1000 } });
  });
  it("prevents assigning unavailable stock", async () => {
    mocks.inventoryItem.findFirst.mockResolvedValue({ ...item, quantity: 2 });
    await expect(allocateInventory({ sellerUserId, itemId: "item", listingId: "listing" })).rejects.toThrow(/unassigned/u);
    expect(mocks.inventoryAllocation.create).not.toHaveBeenCalled();
  });
  it("snapshots cost and restricts assignment to an unassigned seller listing", async () => {
    mocks.listing.findFirst.mockResolvedValue({ id: "listing" });
    await allocateInventory({ sellerUserId, itemId: "item", listingId: "listing" });
    expect(mocks.listing.findFirst).toHaveBeenCalledWith({ where: { id: "listing", sellerUserId, inventoryAllocation: null, status: { not: "archived" } } });
    expect(mocks.inventoryAllocation.create).toHaveBeenCalledWith({ data: { inventoryItemId: "item", listingId: "listing", unitCostCents: 1000 } });
  });
  it.each([
    { status: "published", orders: [], auction: null },
    { status: "archived", orders: [{ status: "cancelled", paidAtUtc: new Date() }], auction: null },
    { status: "unsold", orders: [], auction: { status: "ended", bids: [], runnerUpOffers: [{ status: "pending" }] } }
  ])("retains assignments for committed listings", async (listing) => {
    mocks.inventoryAllocation.findFirst.mockResolvedValue({ id: "a", item, listing, unitCostCents: 1000 });
    await expect(releaseInventoryAllocation({ sellerUserId, allocationId: "a" })).rejects.toThrow(/cannot be released/u);
    expect(mocks.inventoryAllocation.delete).not.toHaveBeenCalled();
  });
  it("releases an ended cancelled unpaid listing despite historical bids and returns original cost", async () => {
    mocks.inventoryAllocation.findFirst.mockResolvedValue({ id: "a", item, unitCostCents: 2500, listing: { id: "l", status: "archived", orders: [{ status: "cancelled", paidAtUtc: null }], auction: { status: "ended", bids: [{ status: "winning" }], runnerUpOffers: [] } } });
    await releaseInventoryAllocation({ sellerUserId, allocationId: "a" });
    expect(mocks.inventoryAllocation.delete).toHaveBeenCalledWith({ where: { id: "a" } });
    expect(mocks.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { unitCostCents: 1500 } });
  });
  it("audits per-item selling-cost updates within seller scope", async () => {
    mocks.inventoryAllocation.findFirst.mockResolvedValue({ id: "a", inventoryItemId: "item", listingId: "l", unitCostCents: 1000, sellingCostCents: 0 });
    await updateAllocationSellingCost({ sellerUserId, allocationId: "a", sellingCost: "2.39" });
    expect(mocks.inventoryAllocation.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { sellingCostCents: 239 } });
    expect(mocks.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: sellerUserId, kind: "selling_cost_updated" }) });
  });
  it("retries a serializable conflict with the whole transaction", async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19" }));
    await receivePurchaseOrder({ sellerUserId, purchaseOrderId: "po" });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
