import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { CatalogValidationError, slugify } from "./index";

export type RelistMode = "same_settings" | "edit";

async function buildUniqueRelistedSlug(transaction: Prisma.TransactionClient, baseSlug: string) {
  const normalizedBaseSlug = baseSlug || "listing";

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${suffix + 1}`;
    const existingListing = await transaction.listing.findFirst({
      where: {
        slug: candidate
      },
      select: {
        id: true
      }
    });

    if (!existingListing) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique relist slug.");
}

export function buildAuctionRelistSchedule(input: {
  startAtUtc: Date;
  endAtUtc: Date;
  now: Date;
}) {
  const originalDurationMs = input.endAtUtc.getTime() - input.startAtUtc.getTime();
  const durationMs = Math.max(originalDurationMs, 60 * 1000);

  return {
    startAtUtc: input.now,
    endAtUtc: new Date(input.now.getTime() + durationMs)
  };
}

export async function relistListing(input: {
  listingId: string;
  mode: RelistMode;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const sourceListing = await transaction.listing.findUniqueOrThrow({
      where: {
        id: input.listingId
      },
      include: {
        inventoryAllocation: true,
        auction: true,
        images: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });

    // Cloning a linked listing would leave its stock and sale accounting on the old listing.
    // Keep that link intact; eligible unused stock can be released explicitly in Inventory.
    if (sourceListing.inventoryAllocation) {
      throw new CatalogValidationError(
        "inventory_linked_listing",
        "This listing is linked to inventory. Release unused stock from the listing in Inventory before relisting or duplicating it. Paid or committed stock cannot be released."
      );
    }

    const nextSlug = await buildUniqueRelistedSlug(
      transaction,
      slugify(`${sourceListing.title} relist`)
    );
    const nextListingStatus = input.mode === "same_settings" ? "published" : "draft";
    const relistedListing = await transaction.listing.create({
      data: {
        sellerUserId: sourceListing.sellerUserId,
        categoryId: sourceListing.categoryId,
        pickupEventId: sourceListing.pickupEventId,
        listingType: sourceListing.listingType,
        status: nextListingStatus,
        slug: nextSlug,
        title: sourceListing.title,
        description: sourceListing.description,
        conditionNote: sourceListing.conditionNote,
        fixedPriceCents: sourceListing.fixedPriceCents,
        fulfillmentMode: sourceListing.fulfillmentMode,
        shippingFeeCents: sourceListing.shippingFeeCents,
        shippingNotes: sourceListing.shippingNotes,
        publishedAtUtc: nextListingStatus === "published" ? now : null,
        archivedAtUtc: null
      }
    });

    if (sourceListing.images.length > 0) {
      await transaction.listingImage.createMany({
        data: sourceListing.images.map((image) => ({
          listingId: relistedListing.id,
          storageKey: image.storageKey,
          publicUrl: image.publicUrl,
          altText: image.altText,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary
        }))
      });
    }

    if (sourceListing.listingType === "auction" && sourceListing.auction) {
      const schedule = buildAuctionRelistSchedule({
        startAtUtc: sourceListing.auction.startAtUtc,
        endAtUtc: sourceListing.auction.endAtUtc,
        now
      });

      await transaction.auction.create({
        data: {
          listingId: relistedListing.id,
          status: "live",
          startAtUtc: schedule.startAtUtc,
          endAtUtc: schedule.endAtUtc,
          startingBidCents: sourceListing.auction.startingBidCents,
          minimumIncrementCents: sourceListing.auction.minimumIncrementCents,
          currentHighestBidCents: null,
          currentHighestBidderId: null,
          closedAtUtc: null
        }
      });
    }

    return relistedListing;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
