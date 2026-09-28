import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMocks = vi.hoisted(() => ({ headers: vi.fn() }));
const authMocks = vi.hoisted(() => ({ requireAdminUser: vi.fn() }));
const envMocks = vi.hoisted(() => ({ getAppEnv: vi.fn() }));
const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); })
}));
const serviceMocks = vi.hoisted(() => ({
  createPurchaseOrder: vi.fn(),
  receivePurchaseOrder: vi.fn(),
  adjustInventory: vi.fn(),
  allocateInventory: vi.fn(),
  releaseInventoryAllocation: vi.fn(),
  updateAllocationSellingCost: vi.fn()
}));

vi.mock("next/headers", () => headersMocks);
vi.mock("next/navigation", () => navigationMocks);
vi.mock("next/cache", () => cacheMocks);
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/config/app-env", () => envMocks);
vi.mock("@/lib/inventory/service", () => serviceMocks);

import {
  adjustInventoryAction,
  allocateInventoryAction,
  createPurchaseOrderAction,
  receivePurchaseOrderAction,
  releaseInventoryAllocationAction,
  updateAllocationSellingCostAction
} from "../src/lib/inventory/actions.js";
import { ServerActionOriginError } from "../src/lib/auth/server-action.js";
import { InventoryError } from "../src/lib/inventory/rules.js";

function allActions() {
  return [
    () => createPurchaseOrderAction({ error: null }, new FormData()),
    () => receivePurchaseOrderAction("po_1"),
    () => adjustInventoryAction("item_1", new FormData()),
    () => allocateInventoryAction("item_1", new FormData()),
    () => releaseInventoryAllocationAction("item_1", "allocation_1"),
    () => updateAllocationSellingCostAction("item_1", "allocation_1", new FormData())
  ];
}

describe("inventory admin action boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigationMocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
    authMocks.requireAdminUser.mockResolvedValue({ id: "admin_1", role: "admin" });
    envMocks.getAppEnv.mockReturnValue({ app: { url: "https://market.example" }, runtime: { isProduction: true } });
    headersMocks.headers.mockResolvedValue(new Headers({ Origin: "https://market.example" }));
  });

  it.each(["https://untrusted.example", null])("blocks every mutation with rejected origin %s before authentication", async (origin) => {
    headersMocks.headers.mockResolvedValue(new Headers(origin ? { Origin: origin } : {}));
    for (const action of allActions()) await expect(action()).rejects.toBeInstanceOf(ServerActionOriginError);
    expect(authMocks.requireAdminUser).not.toHaveBeenCalled();
    for (const mutation of Object.values(serviceMocks)) expect(mutation).not.toHaveBeenCalled();
  });

  it("requires admin authorization for every inventory mutation", async () => {
    authMocks.requireAdminUser.mockRejectedValue(new Error("NEXT_REDIRECT:/account"));
    for (const action of allActions()) await expect(action()).rejects.toThrow("NEXT_REDIRECT:/account");
    for (const mutation of Object.values(serviceMocks)) expect(mutation).not.toHaveBeenCalled();
  });

  it("creates a draft as the authenticated seller without receiving stock", async () => {
    const data = new FormData();
    data.set("sellerUserId", "another_seller");
    data.set("reference", "PO-1");
    data.set("supplier", "Supplier");
    data.set("notes", "Opening purchase");
    data.set("csv", "sku,title,quantity,unit_cost\nSKU-1,Test,2,12.50");
    await expect(createPurchaseOrderAction({ error: null }, data)).rejects.toThrow("NEXT_REDIRECT:/admin/inventory/purchase-orders?status=purchase_order_saved");
    expect(serviceMocks.createPurchaseOrder).toHaveBeenCalledWith({ sellerUserId: "admin_1", reference: "PO-1", supplier: "Supplier", notes: "Opening purchase", csv: data.get("csv") });
    expect(serviceMocks.receivePurchaseOrder).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/admin/inventory");
  });

  it("returns purchase validation errors without redirecting away from the entered CSV", async () => {
    serviceMocks.createPurchaseOrder.mockRejectedValue(new InventoryError("duplicate_record", "That reference is already in use."));
    await expect(createPurchaseOrderAction({ error: null }, new FormData())).resolves.toEqual({ error: "That reference is already in use." });
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not expose unexpected internal errors in import feedback", async () => {
    serviceMocks.createPurchaseOrder.mockRejectedValue(new Error("Private database details"));
    const result = await createPurchaseOrderAction({ error: null }, new FormData());
    expect(result.error).toContain("could not save");
    expect(result.error).not.toContain("Private");
  });

  it("scopes receipt, adjustments, allocations, releases, and selling costs to the authenticated seller", async () => {
    const data = new FormData();
    data.set("sellerUserId", "another_seller");
    data.set("quantityDelta", "-2");
    data.set("unitCost", "3.40");
    data.set("reason", "Damaged in storage");
    data.set("listingId", "listing_1");
    data.set("sellingCost", "9.25");

    await expect(receivePurchaseOrderAction("po_1")).rejects.toThrow("status=purchase_order_received");
    await expect(adjustInventoryAction("item_1", data)).rejects.toThrow("status=inventory_adjusted");
    await expect(allocateInventoryAction("item_1", data)).rejects.toThrow("status=inventory_allocated");
    await expect(releaseInventoryAllocationAction("item_1", "allocation_1")).rejects.toThrow("status=inventory_released");
    await expect(updateAllocationSellingCostAction("item_1", "allocation_1", data)).rejects.toThrow("status=selling_cost_saved");

    expect(serviceMocks.receivePurchaseOrder).toHaveBeenCalledWith({ sellerUserId: "admin_1", purchaseOrderId: "po_1" });
    expect(serviceMocks.adjustInventory).toHaveBeenCalledWith({ sellerUserId: "admin_1", itemId: "item_1", quantityDelta: "-2", unitCost: "3.40", reason: "Damaged in storage" });
    expect(serviceMocks.allocateInventory).toHaveBeenCalledWith({ sellerUserId: "admin_1", itemId: "item_1", listingId: "listing_1" });
    expect(serviceMocks.releaseInventoryAllocation).toHaveBeenCalledWith({ sellerUserId: "admin_1", allocationId: "allocation_1" });
    expect(serviceMocks.updateAllocationSellingCost).toHaveBeenCalledWith({ sellerUserId: "admin_1", allocationId: "allocation_1", sellingCost: "9.25" });
  });

  it("shows a domain failure on the affected item without reporting success", async () => {
    serviceMocks.adjustInventory.mockRejectedValue(new InventoryError("stock_committed", "Assigned stock cannot be removed."));
    await expect(adjustInventoryAction("item_1", new FormData())).rejects.toThrow("/admin/inventory/item_1?error=Assigned%20stock%20cannot%20be%20removed.");
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
