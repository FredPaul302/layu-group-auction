"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminServerActionUser } from "@/lib/auth/server-action";

import { InventoryError } from "./rules";
import {
  adjustInventory,
  allocateInventory,
  createPurchaseOrder,
  receivePurchaseOrder,
  releaseInventoryAllocation,
  updateAllocationSellingCost
} from "./service";

export type InventoryImportState = { error: string | null };

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  return error instanceof InventoryError
    ? error.message
    : "We could not save this change. Refresh the page and try again.";
}

function refreshInventory(itemId?: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/purchase-orders");
  if (itemId) revalidatePath(`/admin/inventory/${encodeURIComponent(itemId)}`);
}

export async function createPurchaseOrderAction(
  _previousState: InventoryImportState,
  formData: FormData
): Promise<InventoryImportState> {
  const admin = await requireAdminServerActionUser();

  try {
    await createPurchaseOrder({
      sellerUserId: admin.id,
      reference: field(formData, "reference"),
      supplier: field(formData, "supplier"),
      notes: field(formData, "notes"),
      csv: field(formData, "csv")
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  refreshInventory();
  redirect("/admin/inventory/purchase-orders?status=purchase_order_saved");
}

export async function receivePurchaseOrderAction(purchaseOrderId: string) {
  const admin = await requireAdminServerActionUser();

  try {
    await receivePurchaseOrder({ sellerUserId: admin.id, purchaseOrderId });
  } catch (error) {
    redirect(`/admin/inventory/purchase-orders?error=${encodeURIComponent(errorMessage(error))}`);
  }

  refreshInventory();
  redirect("/admin/inventory/purchase-orders?status=purchase_order_received");
}

export async function adjustInventoryAction(itemId: string, formData: FormData) {
  const admin = await requireAdminServerActionUser();
  const path = `/admin/inventory/${encodeURIComponent(itemId)}`;

  try {
    await adjustInventory({
      sellerUserId: admin.id,
      itemId,
      quantityDelta: field(formData, "quantityDelta"),
      unitCost: field(formData, "unitCost"),
      reason: field(formData, "reason")
    });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  refreshInventory(itemId);
  redirect(`${path}?status=inventory_adjusted`);
}

export async function allocateInventoryAction(itemId: string, formData: FormData) {
  const admin = await requireAdminServerActionUser();
  const path = `/admin/inventory/${encodeURIComponent(itemId)}`;

  try {
    await allocateInventory({
      sellerUserId: admin.id,
      itemId,
      listingId: field(formData, "listingId")
    });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  refreshInventory(itemId);
  redirect(`${path}?status=inventory_allocated`);
}

export async function releaseInventoryAllocationAction(itemId: string, allocationId: string) {
  const admin = await requireAdminServerActionUser();
  const path = `/admin/inventory/${encodeURIComponent(itemId)}`;

  try {
    await releaseInventoryAllocation({ sellerUserId: admin.id, allocationId });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  refreshInventory(itemId);
  redirect(`${path}?status=inventory_released`);
}

export async function updateAllocationSellingCostAction(
  itemId: string,
  allocationId: string,
  formData: FormData
) {
  const admin = await requireAdminServerActionUser();
  const path = `/admin/inventory/${encodeURIComponent(itemId)}`;

  try {
    await updateAllocationSellingCost({
      sellerUserId: admin.id,
      allocationId,
      sellingCost: field(formData, "sellingCost")
    });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  refreshInventory(itemId);
  redirect(`${path}?status=selling_cost_saved`);
}
