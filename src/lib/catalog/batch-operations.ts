import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { weightedInventoryCost } from "@/lib/inventory/rules";
import { CatalogValidationError, validateListingInput } from "./index";

export function listingBatchIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    throw new CatalogValidationError("invalid_selection", "Select between 1 and 100 listings.");
  }
  return [...new Set(value as string[])];
}

export async function manageListingBatch(input: { ids: string[]; action: "publish" | "delete"; sellerUserId: string; now?: Date }) {
  const ids = listingBatchIds(input.ids);
  const now = input.now ?? new Date();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const listings = await tx.listing.findMany({ where: { id: { in: ids }, sellerUserId: input.sellerUserId }, include: {
          category: true, images: true, orders: { select: { id: true } },
          auction: { include: { _count: { select: { bids: true, runnerUpOffers: true } } } },
          inventoryAllocation: { include: { item: { include: { _count: { select: { allocations: true } } } } } }
        } });
        if (listings.length !== ids.length) throw new CatalogValidationError("listing_not_found", "A selected listing is no longer available. Refresh the list.");
        for (const listing of listings) {
          if (input.action === "delete") {
            if (listing.orders.length || (listing.auction?._count.bids ?? 0) || (listing.auction?._count.runnerUpOffers ?? 0) || !["draft", "published", "unsold", "archived"].includes(listing.status)) {
              throw new CatalogValidationError("listing_has_history", `“${listing.title}” has bid, order, or offer history and cannot be deleted. No selected listings were deleted.`);
            }
          } else {
            if (listing.status !== "draft") throw new CatalogValidationError("listing_not_draft", `“${listing.title}” is no longer a draft. Refresh before publishing.`);
            if (!listing.category.isEnabled || !listing.images.length || !listing.description?.trim()) throw new CatalogValidationError("listing_incomplete", `“${listing.title}” needs an enabled category, description, and at least one photo before publishing.`);
            try {
              validateListingInput({ ...listing, saveAs: "published", startingBidCents: listing.auction?.startingBidCents,
                endAtUtc: listing.auction?.endAtUtc, categoryMinimumStartBidCents: listing.category.minimumStartBidCents,
                categoryMinimumBidIncrementCents: listing.category.minimumBidIncrementCents });
            } catch (error) {
              if (error instanceof CatalogValidationError) throw new CatalogValidationError(error.code, `“${listing.title}”: ${error.message}`);
              throw error;
            }
          }
        }
        for (const listing of listings) {
          if (input.action === "publish") {
            await tx.listing.update({ where: { id: listing.id, status: "draft" }, data: { status: "published", publishedAtUtc: now, archivedAtUtc: null } });
            if (listing.auction) await tx.auction.update({ where: { id: listing.auction.id }, data: { status: "live", startAtUtc: now } });
          } else {
            const allocation = listing.inventoryAllocation;
            if (allocation) {
              const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: allocation.item.id }, include: { _count: { select: { allocations: true } } } });
              const unitCostCents = weightedInventoryCost({ available: item.quantity - item._count.allocations, unitCostCents: item.unitCostCents,
                incomingQuantity: 1, incomingUnitCostCents: allocation.unitCostCents });
              await tx.inventoryAllocation.delete({ where: { id: allocation.id } });
              await tx.inventoryItem.update({ where: { id: item.id }, data: { unitCostCents } });
              await tx.inventoryMovement.create({ data: { inventoryItemId: item.id, kind: "listing_released", quantityDelta: 0,
                unitCostCents: allocation.unitCostCents, reason: "Unused listing deleted; stock assignment released", reference: listing.id, actorUserId: input.sellerUserId } });
            }
            await tx.listing.delete({ where: { id: listing.id } });
          }
        }
        return { count: listings.length };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2034" && attempt < 2) continue;
        if (["P2034", "P2003", "P2025"].includes(error.code)) throw new CatalogValidationError("listing_state_changed", "A listing changed while this action was running. Refresh and review it; no partial changes were saved.");
      }
      throw error;
    }
  }
  throw new Error("Listing batch could not be completed.");
}
