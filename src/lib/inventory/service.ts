import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  InventoryError, inventoryText, nextInventoryBalance, parseInventoryCsv,
  parseInventoryMoney, parseInventoryQuantity, weightedInventoryCost
} from "./rules";

const allocationInclude = {
  listing: { include: { orders: { orderBy: { createdAtUtc: "desc" as const } } } }
} satisfies Prisma.InventoryAllocationInclude;
const itemInclude = { allocations: { include: allocationInclude } } satisfies Prisma.InventoryItemInclude;

export async function listInventory(sellerUserId: string, search = "") {
  return prisma.inventoryItem.findMany({
    where: {
      sellerUserId,
      ...(search.trim() ? { OR: [
        { sku: { contains: search.trim().slice(0, 200), mode: "insensitive" as const } },
        { title: { contains: search.trim().slice(0, 200), mode: "insensitive" as const } },
        { location: { contains: search.trim().slice(0, 200), mode: "insensitive" as const } }
      ] } : {})
    },
    include: itemInclude,
    orderBy: { sku: "asc" }
  });
}

export async function getInventoryItem(sellerUserId: string, itemId: string) {
  return prisma.inventoryItem.findFirst({
    where: { id: itemId, sellerUserId },
    include: { ...itemInclude, movements: { orderBy: { createdAtUtc: "desc" }, take: 100 } }
  });
}

export async function listPurchaseOrders(sellerUserId: string) {
  return prisma.inventoryPurchaseOrder.findMany({
    where: { sellerUserId }, include: { lines: { orderBy: { sku: "asc" } } },
    orderBy: { createdAtUtc: "desc" }, take: 100
  });
}

export async function listAvailableInventoryListings(sellerUserId: string) {
  return prisma.listing.findMany({
    where: { sellerUserId, inventoryAllocation: null, status: { not: "archived" } },
    select: { id: true, title: true, listingType: true, status: true },
    orderBy: { createdAtUtc: "desc" }, take: 500
  });
}

async function inventoryTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2034") {
          if (attempt < 2) continue;
          throw new InventoryError("inventory_busy", "Another inventory change is in progress. Please try again.");
        }
        if (error.code === "P2002") throw new InventoryError("duplicate_record", "This purchase-order reference or listing assignment already exists. Refresh to check the saved record.");
      }
      throw error;
    }
  }
  throw new InventoryError("inventory_busy", "Please try the inventory change again.");
}

async function requireItem(transaction: Prisma.TransactionClient, sellerUserId: string, itemId: string) {
  const item = await transaction.inventoryItem.findFirst({ where: { id: itemId, sellerUserId }, include: { _count: { select: { allocations: true } } } });
  if (!item) throw new InventoryError("item_not_found", "Inventory item was not found.");
  return item;
}

export async function createPurchaseOrder(input: { sellerUserId: string; reference: string; supplier: string; notes?: string | null; csv: string }) {
  const reference = inventoryText(input.reference, "Purchase-order reference", 120);
  const supplier = inventoryText(input.supplier, "Supplier", 200);
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new InventoryError("invalid_notes", "Notes must be 2,000 characters or fewer.");
  const lines = parseInventoryCsv(input.csv);
  return inventoryTransaction((transaction) => transaction.inventoryPurchaseOrder.create({
    data: { sellerUserId: input.sellerUserId, reference, supplier, notes, lines: { create: lines } }, include: { lines: true }
  }));
}

export async function receivePurchaseOrder(input: { sellerUserId: string; purchaseOrderId: string }) {
  return inventoryTransaction(async (transaction) => {
    const purchaseOrder = await transaction.inventoryPurchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, sellerUserId: input.sellerUserId }, include: { lines: true }
    });
    if (!purchaseOrder) throw new InventoryError("purchase_order_not_found", "Purchase order was not found.");
    // Receiving twice is safe, including a repeated browser submission.
    if (purchaseOrder.receivedAtUtc) return purchaseOrder;
    for (const line of purchaseOrder.lines) {
      const existing = await transaction.inventoryItem.findUnique({
        where: { sellerUserId_sku: { sellerUserId: input.sellerUserId, sku: line.sku } },
        include: { _count: { select: { allocations: true } } }
      });
      const quantity = nextInventoryBalance({ quantity: existing?.quantity ?? 0, allocated: existing?._count.allocations ?? 0, quantityDelta: line.quantity });
      const unitCostCents = existing ? weightedInventoryCost({
        available: existing.quantity - existing._count.allocations, unitCostCents: existing.unitCostCents,
        incomingQuantity: line.quantity, incomingUnitCostCents: line.unitCostCents
      }) : line.unitCostCents;
      const item = existing
        ? await transaction.inventoryItem.update({ where: { id: existing.id }, data: { quantity, unitCostCents } })
        : await transaction.inventoryItem.create({ data: {
          sellerUserId: input.sellerUserId, sku: line.sku, title: line.title,
          location: line.location, quantity, unitCostCents
        } });
      await transaction.inventoryMovement.create({ data: {
        inventoryItemId: item.id, kind: "purchase_receipt", quantityDelta: line.quantity,
        unitCostCents: line.unitCostCents, reason: `Received ${purchaseOrder.reference}`,
        reference: purchaseOrder.id, actorUserId: input.sellerUserId
      } });
    }
    return transaction.inventoryPurchaseOrder.update({ where: { id: purchaseOrder.id }, data: { receivedAtUtc: new Date() }, include: { lines: true } });
  });
}

export async function adjustInventory(input: { sellerUserId: string; itemId: string; quantityDelta: string; unitCost: string; reason: string }) {
  const quantityDelta = parseInventoryQuantity(input.quantityDelta, true);
  const reason = inventoryText(input.reason, "Adjustment reason", 500);
  const incomingUnitCostCents = quantityDelta > 0 ? parseInventoryMoney(input.unitCost) : null;
  return inventoryTransaction(async (transaction) => {
    const item = await requireItem(transaction, input.sellerUserId, input.itemId);
    const quantity = nextInventoryBalance({ quantity: item.quantity, allocated: item._count.allocations, quantityDelta });
    const unitCostCents = incomingUnitCostCents !== null ? weightedInventoryCost({
      available: item.quantity - item._count.allocations, unitCostCents: item.unitCostCents,
      incomingQuantity: quantityDelta, incomingUnitCostCents
    }) : item.unitCostCents;
    await transaction.inventoryMovement.create({ data: {
      inventoryItemId: item.id, kind: "adjustment", quantityDelta,
      unitCostCents: incomingUnitCostCents ?? item.unitCostCents, reason, actorUserId: input.sellerUserId
    } });
    return transaction.inventoryItem.update({ where: { id: item.id }, data: { quantity, unitCostCents } });
  });
}

export async function allocateInventory(input: { sellerUserId: string; itemId: string; listingId: string }) {
  return inventoryTransaction(async (transaction) => {
    const item = await requireItem(transaction, input.sellerUserId, input.itemId);
    if (item.quantity - item._count.allocations < 1) throw new InventoryError("out_of_stock", "No unassigned stock is available for this listing.");
    const listing = await transaction.listing.findFirst({
      where: { id: input.listingId, sellerUserId: input.sellerUserId, inventoryAllocation: null, status: { not: "archived" } }
    });
    if (!listing) throw new InventoryError("listing_unavailable", "Choose an unassigned listing belonging to this seller.");
    const allocation = await transaction.inventoryAllocation.create({ data: {
      inventoryItemId: item.id, listingId: listing.id, unitCostCents: item.unitCostCents
    } });
    await transaction.inventoryMovement.create({ data: {
      inventoryItemId: item.id, kind: "listing_assigned", quantityDelta: 0,
      unitCostCents: item.unitCostCents, reason: "One stock unit assigned to listing",
      reference: listing.id, actorUserId: input.sellerUserId
    } });
    return allocation;
  });
}

export async function releaseInventoryAllocation(input: { sellerUserId: string; allocationId: string }) {
  return inventoryTransaction(async (transaction) => {
    const allocation = await transaction.inventoryAllocation.findFirst({
      where: { id: input.allocationId, item: { sellerUserId: input.sellerUserId } },
      include: { item: { include: { _count: { select: { allocations: true } } } }, listing: {
        include: { orders: true, auction: { include: { bids: true, runnerUpOffers: true } } }
      } }
    });
    if (!allocation) throw new InventoryError("allocation_not_found", "Stock assignment was not found.");
    const { listing, item } = allocation;
    if (!["draft", "unsold", "archived"].includes(listing.status) ||
        listing.orders.some((order) => order.status !== "cancelled" || order.paidAtUtc !== null) ||
        (listing.auction?.status === "live" && listing.auction.bids.some((bid) => !["invalid", "withdrawn"].includes(bid.status))) ||
        listing.auction?.runnerUpOffers.some((offer) => ["pending", "accepted"].includes(offer.status))) {
      throw new InventoryError("listing_committed", "Stock cannot be released from a live listing or one with bids, offers, payment, or an active order. Unpublish an unused listing first.");
    }
    const unitCostCents = weightedInventoryCost({
      available: item.quantity - item._count.allocations, unitCostCents: item.unitCostCents,
      incomingQuantity: 1, incomingUnitCostCents: allocation.unitCostCents
    });
    await transaction.inventoryAllocation.delete({ where: { id: allocation.id } });
    await transaction.inventoryItem.update({ where: { id: item.id }, data: { unitCostCents } });
    await transaction.inventoryMovement.create({ data: {
      inventoryItemId: item.id, kind: "listing_released", quantityDelta: 0,
      unitCostCents: allocation.unitCostCents, reason: "Unused listing stock assignment released",
      reference: listing.id, actorUserId: input.sellerUserId
    } });
    return item;
  });
}

export async function updateAllocationSellingCost(input: { sellerUserId: string; allocationId: string; sellingCost: string }) {
  const sellingCostCents = parseInventoryMoney(input.sellingCost);
  return inventoryTransaction(async (transaction) => {
    const allocation = await transaction.inventoryAllocation.findFirst({
      where: { id: input.allocationId, item: { sellerUserId: input.sellerUserId } }
    });
    if (!allocation) throw new InventoryError("allocation_not_found", "Stock assignment was not found.");
    await transaction.inventoryMovement.create({ data: {
      inventoryItemId: allocation.inventoryItemId, kind: "selling_cost_updated", quantityDelta: 0,
      unitCostCents: allocation.unitCostCents,
      reason: `Selling costs changed from ${(allocation.sellingCostCents / 100).toFixed(2)} to ${(sellingCostCents / 100).toFixed(2)} USD`,
      reference: allocation.listingId, actorUserId: input.sellerUserId
    } });
    return transaction.inventoryAllocation.update({ where: { id: allocation.id }, data: { sellingCostCents } });
  });
}
