import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildStoredAssetRoute } from "@/lib/storage/asset-route";

import {
  type BulkListingItemInput,
  type BulkListingMediaInput,
  getBulkListingMediaKind,
  validateBulkListingWorkspace
} from "./bulk-listings";
import {
  CatalogValidationError,
  parseIntegerInput,
  parseOptionalDateTime,
  parseOptionalText,
  slugify,
  validateListingInput
} from "./index";

export class BulkListingImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly issues: Array<{
      code: string;
      fileId?: string;
      itemClientId?: string;
      message: string;
      severity: "error" | "warning";
    }> = []
  ) {
    super(message);
    this.name = "BulkListingImportError";
  }
}

type BulkListingSubmittedFile = {
  file: File;
  id: string;
};

type StoredBulkMedia = {
  contentType: string;
  fileName: string;
  id: string;
  kind: "image" | "video";
  publicUrl: string;
  sizeBytes: number;
  storageKey: string;
};

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function toMediaInputs(files: BulkListingSubmittedFile[]): BulkListingMediaInput[] {
  return files.map(({ file, id }) => ({
    id,
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type
  }));
}

function getOrderedImageIds(item: BulkListingItemInput) {
  const requestedOrder = item.imageOrder?.filter((fileId) => item.imageFileIds.includes(fileId)) ?? [];
  const remainingImageIds = item.imageFileIds.filter((fileId) => !requestedOrder.includes(fileId));
  return [...requestedOrder, ...remainingImageIds];
}

async function buildUniqueListingSlug(
  transaction: Prisma.TransactionClient,
  baseSlug: string,
  reservedSlugs: Set<string>
) {
  const normalizedBaseSlug = baseSlug || "listing";

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${suffix + 1}`;

    if (reservedSlugs.has(candidate)) {
      continue;
    }

    const existingListing = await transaction.listing.findFirst({
      where: {
        slug: candidate
      },
      select: {
        id: true
      }
    });

    if (!existingListing) {
      reservedSlugs.add(candidate);
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique listing slug.");
}

function parseBulkListingItemForValidation(item: BulkListingItemInput) {
  const listingType: "auction" | "fixed_price" =
    item.listingType === "fixed_price" ? "fixed_price" : "auction";

  return {
    categorySlug: normalizeText(item.categorySlug),
    conditionNote: parseOptionalText(item.condition),
    description: normalizeText(item.description),
    endAtUtc:
      listingType === "auction"
        ? parseOptionalDateTime(item.endAtUtc ?? "", "end_at_utc")
        : null,
    fixedPriceCents:
      listingType === "fixed_price"
        ? parseIntegerInput(item.priceCents ?? "", "price_cents", {
            minimum: 1
          })
        : null,
    listingType,
    mediaPrefix: parseOptionalText(item.mediaPrefix),
    sku: normalizeText(item.sku),
    startingBidCents:
      listingType === "auction"
        ? parseIntegerInput(item.startingBidCents ?? "", "starting_bid_cents", {
            minimum: 0
          })
        : null,
    title: normalizeText(item.title)
  };
}

async function cleanupStoredMedia(storedMedia: StoredBulkMedia[]) {
  if (storedMedia.length === 0) {
    return;
  }

  const storageAdapter = getStorageAdapter();
  const cleanupResults = await Promise.allSettled(
    storedMedia.map((media) => storageAdapter.remove(media.storageKey))
  );

  for (const [index, result] of cleanupResults.entries()) {
    if (result.status === "rejected") {
      console.warn("Failed to clean up bulk listing media after import failure", {
        error: result.reason,
        storageKey: storedMedia[index]?.storageKey
      });
    }
  }
}

export async function createDraftListingsFromBulkWorkspace(input: {
  allowIncompleteDraftRows?: boolean;
  files: BulkListingSubmittedFile[];
  items: BulkListingItemInput[];
  now?: Date;
  sellerUserId: string;
}) {
  const mediaInputs = toMediaInputs(input.files);
  const fileById = new Map(input.files.map((file) => [file.id, file.file]));
  const workspaceValidation = validateBulkListingWorkspace({
    allowIncompleteDraftRows: input.allowIncompleteDraftRows,
    items: input.items,
    media: mediaInputs
  });

  if (workspaceValidation.hasErrors) {
    throw new BulkListingImportError(
      "bulk_validation_failed",
      "Bulk listing validation failed.",
      workspaceValidation.issues
    );
  }

  const normalizedItems = input.items.map((item) => ({
    clientId: item.clientId,
    imageFileIds: getOrderedImageIds(item),
    primaryImageFileId: item.primaryImageFileId || item.imageFileIds[0] || null,
    raw: item,
    videoFileIds: item.videoFileIds,
    ...parseBulkListingItemForValidation(item)
  }));
  const categorySlugs = [...new Set(normalizedItems.map((item) => item.categorySlug))];
  const categories = await prisma.category.findMany({
    where: {
      isEnabled: true,
      slug: {
        in: categorySlugs
      }
    },
    select: {
      id: true,
      minimumBidIncrementCents: true,
      minimumStartBidCents: true,
      slug: true
    }
  });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const issues = [...workspaceValidation.issues];

  for (const item of normalizedItems) {
    if (!categoryBySlug.has(item.categorySlug)) {
      issues.push({
        code: "bulk_category_not_found",
        itemClientId: item.clientId,
        message: `Category slug ${item.categorySlug} is not enabled or does not exist.`,
        severity: "error" as const
      });
    }
  }

  const preparedItems: Array<
    (typeof normalizedItems)[number] & {
      validatedListing: ReturnType<typeof validateListingInput>;
    }
  > = [];

  for (const item of normalizedItems) {
    const category = categoryBySlug.get(item.categorySlug);

    if (!category) {
      continue;
    }

    try {
      preparedItems.push({
        ...item,
        validatedListing: validateListingInput({
          categoryId: category.id,
          categoryMinimumBidIncrementCents: category.minimumBidIncrementCents,
          categoryMinimumStartBidCents: category.minimumStartBidCents,
          conditionNote: item.conditionNote,
          description: item.description,
          endAtUtc: item.endAtUtc,
          fixedPriceCents: item.fixedPriceCents,
          fulfillmentMode: "pickup_only",
          listingType: item.listingType,
          pickupEventId: null,
          saveAs: "draft",
          shippingFeeCents: 0,
          shippingNotes: null,
          startingBidCents: item.startingBidCents,
          title: item.title
        })
      });
    } catch (error) {
      if (error instanceof CatalogValidationError) {
        issues.push({
          code: error.code,
          itemClientId: item.clientId,
          message: error.message,
          severity: "error" as const
        });
      } else {
        throw error;
      }
    }
  }

  if (issues.some((issue) => issue.severity === "error")) {
    throw new BulkListingImportError(
      "bulk_validation_failed",
      "Bulk listing validation failed.",
      issues
    );
  }

  const storedMedia: StoredBulkMedia[] = [];
  const storageAdapter = getStorageAdapter();

  try {
    const assignedFileIds = [
      ...new Set(normalizedItems.flatMap((item) => [...item.imageFileIds, ...item.videoFileIds]))
    ];

    for (const fileId of assignedFileIds) {
      const file = fileById.get(fileId);

      if (!file) {
        throw new BulkListingImportError("bulk_media_missing", "Assigned media file is missing.");
      }

      const kind = getBulkListingMediaKind({
        name: file.name,
        type: file.type
      });

      if (!kind) {
        throw new BulkListingImportError("bulk_media_type_invalid", "Media file type is invalid.");
      }

      const storedAsset = await storageAdapter.save({
        body: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        fileName: file.name
      });

      storedMedia.push({
        contentType: storedAsset.contentType,
        fileName: storedAsset.fileName,
        id: fileId,
        kind,
        publicUrl: buildStoredAssetRoute(storedAsset.key),
        sizeBytes: storedAsset.sizeBytes,
        storageKey: storedAsset.key
      });
    }

    const storedMediaById = new Map(storedMedia.map((media) => [media.id, media]));
    const createdListingIds = await prisma.$transaction(async (transaction) => {
      const reservedSlugs = new Set<string>();
      const listingIds: string[] = [];
      const now = input.now ?? new Date();

      for (const item of preparedItems) {
        const validatedListing = item.validatedListing;
        const listingSlug = await buildUniqueListingSlug(
          transaction,
          slugify(validatedListing.title),
          reservedSlugs
        );
        const listing = await transaction.listing.create({
          data: {
            archivedAtUtc: null,
            categoryId: validatedListing.categoryId,
            conditionNote: validatedListing.conditionNote,
            description: validatedListing.description,
            fixedPriceCents: validatedListing.fixedPriceCents,
            fulfillmentMode: validatedListing.fulfillmentMode,
            listingType: validatedListing.listingType,
            pickupEventId: null,
            publishedAtUtc: null,
            sellerUserId: input.sellerUserId,
            shippingFeeCents: validatedListing.shippingFeeCents,
            shippingNotes: validatedListing.shippingNotes,
            slug: listingSlug,
            status: "draft",
            title: validatedListing.title
          }
        });

        if (
          validatedListing.listingType === "auction" &&
          validatedListing.startingBidCents != null &&
          validatedListing.endAtUtc
        ) {
          await transaction.auction.create({
            data: {
              endAtUtc: validatedListing.endAtUtc,
              listingId: listing.id,
              minimumIncrementCents: validatedListing.categoryMinimumBidIncrementCents,
              startAtUtc: now,
              startingBidCents: validatedListing.startingBidCents,
              status: "live"
            }
          });
        }

        if (item.imageFileIds.length > 0) {
          await transaction.listingImage.createMany({
            data: item.imageFileIds.map((fileId, index) => {
              const media = storedMediaById.get(fileId);

              if (!media) {
                throw new Error("Stored image file is missing.");
              }

              return {
                altText: validatedListing.title,
                isPrimary:
                  item.primaryImageFileId === fileId ||
                  (!item.primaryImageFileId && index === 0),
                listingId: listing.id,
                publicUrl: media.publicUrl,
                sortOrder: index,
                storageKey: media.storageKey
              };
            })
          });
        }

        if (item.videoFileIds.length > 0) {
          await transaction.listingVideo.createMany({
            data: item.videoFileIds.map((fileId, index) => {
              const media = storedMediaById.get(fileId);

              if (!media) {
                throw new Error("Stored video file is missing.");
              }

              return {
                contentType: media.contentType,
                fileName: media.fileName,
                listingId: listing.id,
                publicUrl: null,
                sizeBytes: media.sizeBytes,
                sortOrder: index,
                storageKey: media.storageKey
              };
            })
          });
        }

        listingIds.push(listing.id);
      }

      return listingIds;
    });

    return {
      listingIds: createdListingIds,
      warnings: issues.filter((issue) => issue.severity === "warning")
    };
  } catch (error) {
    await cleanupStoredMedia(storedMedia);
    throw error;
  }
}
