import { prisma } from "@/lib/prisma";

import { slugify } from "./index";

export type RelistMode = "same_settings" | "edit";

async function buildUniqueRelistedSlug(baseSlug: string) {
  const normalizedBaseSlug = baseSlug || "listing";

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${suffix + 1}`;
    const existingListing = await prisma.listing.findFirst({
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
  const sourceListing = await prisma.listing.findUniqueOrThrow({
    where: {
      id: input.listingId
    },
    include: {
      auction: true,
      images: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  const nextSlug = await buildUniqueRelistedSlug(
    slugify(`${sourceListing.title} relist`)
  );
  const nextListingStatus = input.mode === "same_settings" ? "published" : "draft";

  return prisma.$transaction(async (transaction) => {
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
  });
}
