import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireAdminUser: vi.fn() }));
const serviceMocks = vi.hoisted(() => ({
  listInventory: vi.fn(),
  getInventoryItem: vi.fn(),
  listAvailableInventoryListings: vi.fn(),
  listPurchaseOrders: vi.fn()
}));
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/inventory/service", () => serviceMocks);
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/inventory/actions", () => ({
  createPurchaseOrderAction: vi.fn(),
  receivePurchaseOrderAction: vi.fn(),
  adjustInventoryAction: vi.fn(),
  allocateInventoryAction: vi.fn(),
  releaseInventoryAllocationAction: vi.fn(),
  updateAllocationSellingCostAction: vi.fn()
}));

import AdminInventoryPage from "../src/app/(admin)/admin/inventory/page.js";
import AdminInventoryItemPage from "../src/app/(admin)/admin/inventory/[itemId]/page.js";
import AdminPurchaseOrdersPage from "../src/app/(admin)/admin/inventory/purchase-orders/page.js";

const now = new Date("2026-09-13T12:00:00Z");

function inventoryItem() {
  return {
    id: "item_1", sellerUserId: "admin_1", sku: "LAMP-1", title: "Blue lamp", location: "Shelf A",
    quantity: 3, unitCostCents: 1000, createdAtUtc: now, updatedAtUtc: now,
    movements: [{ id: "movement_1", inventoryItemId: "item_1", actorUserId: "admin_1", kind: "adjustment", quantityDelta: -1, unitCostCents: 1000, reason: "Damaged in storage", reference: null, createdAtUtc: now }],
    allocations: [
      { id: "allocation_paid", inventoryItemId: "item_1", listingId: "listing_paid", unitCostCents: 1000, sellingCostCents: 1000, createdAtUtc: now,
        listing: { id: "listing_paid", title: "Sold blue lamp", status: "fulfilled", listingType: "fixed_price", fixedPriceCents: 6000,
          orders: [{ status: "fulfilled", subtotalCents: 6000, shippingFeeCents: 1000, totalCents: 7000, paidAtUtc: now, fulfilledAtUtc: now }] } },
      { id: "allocation_unpaid", inventoryItemId: "item_1", listingId: "listing_unpaid", unitCostCents: 1200, sellingCostCents: 0, createdAtUtc: now,
        listing: { id: "listing_unpaid", title: "Draft blue lamp", status: "draft", listingType: "auction", fixedPriceCents: null, orders: [] } }
    ]
  };
}

describe("inventory admin pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.requireAdminUser.mockResolvedValue({ id: "admin_1", role: "admin" });
    serviceMocks.listInventory.mockResolvedValue([inventoryItem()]);
    serviceMocks.getInventoryItem.mockResolvedValue(inventoryItem());
    serviceMocks.listAvailableInventoryListings.mockResolvedValue([{ id: "listing_new", title: "New lamp listing", listingType: "auction", status: "draft" }]);
    serviceMocks.listPurchaseOrders.mockResolvedValue([]);
  });

  it("requires admin access before inventory, item, or purchase-order reads", async () => {
    authMocks.requireAdminUser.mockRejectedValue(new Error("NEXT_REDIRECT:/account"));
    await expect(AdminInventoryPage({})).rejects.toThrow("NEXT_REDIRECT:/account");
    await expect(AdminInventoryItemPage({ params: Promise.resolve({ itemId: "item_1" }) })).rejects.toThrow("NEXT_REDIRECT:/account");
    await expect(AdminPurchaseOrdersPage({})).rejects.toThrow("NEXT_REDIRECT:/account");
    for (const query of Object.values(serviceMocks)) expect(query).not.toHaveBeenCalled();
  });

  it("scopes the search and export to the signed-in seller and labels the cost assumptions", async () => {
    const html = renderToStaticMarkup(await AdminInventoryPage({ searchParams: Promise.resolve({ q: " Shelf A " }) }));
    expect(serviceMocks.listInventory).toHaveBeenCalledWith("admin_1", "Shelf A");
    expect(html).toContain('/api/admin/inventory/export?q=Shelf%20A');
    expect(html).toContain('/admin/inventory/item_1');
    expect(html).toContain("$50.00");
    expect(html).toContain("before overhead");
    expect(html).toContain("Selling costs start at $0");
  });

  it("keeps unpaid listings out of revenue while exposing item adjustments, allocations, and history", async () => {
    const html = renderToStaticMarkup(await AdminInventoryItemPage({ params: Promise.resolve({ itemId: "item_1" }) }));
    expect(serviceMocks.getInventoryItem).toHaveBeenCalledWith("admin_1", "item_1");
    expect(serviceMocks.listAvailableInventoryListings).toHaveBeenCalledWith("admin_1");
    expect(html).toContain("$70.00");
    expect(html).toContain("$50.00");
    expect(html).toContain("Awaiting paid sale");
    expect(html).toContain("Available after payment");
    expect(html).toContain("Damaged in storage");
    expect(html).toContain("UTC");
    expect(html).toContain('name="quantityDelta"');
    expect(html).toContain('name="sellingCost"');
    expect(html).toContain('value="listing_new"');
    expect(html.match(/Release unused listing stock/gu)).toHaveLength(1);
  });

  it("does not render an item outside the seller's inventory", async () => {
    serviceMocks.getInventoryItem.mockResolvedValue(null);
    await expect(AdminInventoryItemPage({ params: Promise.resolve({ itemId: "other_item" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("offers receipt only for saved drafts and shows received purchase history", async () => {
    const line = { id: "line_1", sku: "LAMP-1", title: "Lamp", quantity: 2, unitCostCents: 1250, location: "Shelf A" };
    serviceMocks.listPurchaseOrders.mockResolvedValue([
      { id: "po_draft", reference: "PO-DRAFT", supplier: "Supplier", notes: null, createdAtUtc: now, receivedAtUtc: null, lines: [line] },
      { id: "po_received", reference: "PO-RECEIVED", supplier: "Supplier", notes: "Inspected", createdAtUtc: now, receivedAtUtc: now, lines: [line] }
    ]);
    const html = renderToStaticMarkup(await AdminPurchaseOrdersPage({}));
    expect(serviceMocks.listPurchaseOrders).toHaveBeenCalledWith("admin_1");
    expect(html).toContain("PO-DRAFT");
    expect(html).toContain("PO-RECEIVED");
    expect(html.match(/Receive all 2 units/gu)).toHaveLength(1);
    expect(html).toContain("Review purchase items");
    expect(html).toContain("$25.00");
  });
});
