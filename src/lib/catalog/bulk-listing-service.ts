import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildStoredAssetRoute } from "@/lib/storage/asset-route";
import { normalizeListingSku, rethrowListingSkuError } from "./sku";
import { lockWorkspace } from "./bulk-workspace-service";

import {
  type BulkListingItemInput,
  type BulkListingMediaInput,
  type BulkListingSavedPhotoReference,
  bulkListingMaxItems,
  getBulkListingMediaKind,
  validateBulkListingWorkspace
} from "./bulk-listings";
import {
  CatalogValidationError,
  listingImageMaxCount,
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
    fixedPriceCents: parseIntegerInput(item.priceCents ?? "", "price_cents", {
      minimum: 1, required: listingType === "fixed_price"
    }),
    listingType,
    mediaPrefix: parseOptionalText(item.mediaPrefix),
    sku: normalizeListingSku(item.sku),
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
  saveAs?: "draft" | "published";
  files: BulkListingSubmittedFile[];
  savedPhotos?: BulkListingSavedPhotoReference[];
  savedAssets?: { id: string; assetId: string }[];
  workspace?: { id: string; version: number };
  items: BulkListingItemInput[];
  now?: Date;
  sellerUserId: string;
}) {
  if (input.workspace) {
    const workspace = await prisma.bulkWorkspace.findFirst({ where: { id: input.workspace.id, sellerUserId: input.sellerUserId } });
    if (!workspace) throw new BulkListingImportError("workspace_missing", "Saved batch not found.");
    if (workspace.listingIds.length) return { listingIds: workspace.listingIds, warnings: [] };
    if (workspace.version !== input.workspace.version) throw new BulkListingImportError("workspace_conflict", "This batch changed elsewhere. Resume the latest saved version before creating listings.");
  }
  const assetReferences = input.savedAssets ?? [];
  if (assetReferences.length && !input.workspace) throw new BulkListingImportError("workspace_missing", "Save batch progress before using saved attachments.");
  const references = input.savedPhotos ?? [];
  if (references.length + assetReferences.length > bulkListingMaxItems * (listingImageMaxCount + 1) ||
    new Set([...input.files.map((entry) => entry.id), ...references.map((entry) => entry.id), ...assetReferences.map((entry) => entry.id)]).size !== input.files.length + references.length + assetReferences.length ||
    new Set(assetReferences.map((entry) => entry.assetId)).size !== assetReferences.length ||
    new Set(references.map((entry) => entry.savedPhotoId)).size !== references.length) {
    throw new BulkListingImportError("bulk_media_id_invalid", "Each selected photo must appear only once in the batch.");
  }
  const savedPhotos = references.length ? await prisma.savedPhoto.findMany({
    where: { sellerUserId: input.sellerUserId, id: { in: references.map((entry) => entry.savedPhotoId) } },
    select: { id: true, storageKey: true, fileName: true, contentType: true, sizeBytes: true }
  }) : [];
  if (savedPhotos.length !== references.length) {
    throw new BulkListingImportError("bulk_saved_photo_missing", "A saved photo is no longer available. Refresh the photo inbox and select your photos again.");
  }
  const savedById = new Map(savedPhotos.map((photo) => [photo.id, photo]));
  const savedByFileId = new Map(references.map((entry) => [entry.id, savedById.get(entry.savedPhotoId)!]));
  const assets = assetReferences.length ? await prisma.bulkWorkspaceAsset.findMany({ where: { workspaceId: input.workspace!.id, id: { in: assetReferences.map((entry) => entry.assetId) }, workspace: { sellerUserId: input.sellerUserId } } }) : [];
  if (assets.length !== assetReferences.length) throw new BulkListingImportError("workspace_media_missing", "A saved attachment is missing. Resume your saved batch and check its photos.");
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const reference of assetReferences) savedByFileId.set(reference.id, assetsById.get(reference.assetId)!);
  const mediaInputs = toMediaInputs(input.files);
  for (const [id, photo] of savedByFileId) {
    mediaInputs.push({ id, savedPhotoId: photo.id, name: photo.fileName, type: photo.contentType, size: photo.sizeBytes });
  }
  const fileById = new Map(input.files.map((file) => [file.id, file.file]));
  const workspaceValidation = validateBulkListingWorkspace({
    allowIncompleteDraftRows: input.saveAs === "published" ? false : input.allowIncompleteDraftRows,
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
          saveAs: input.saveAs ?? "draft",
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
      const savedPhoto = savedByFileId.get(fileId);

      if (!file && !savedPhoto) {
        throw new BulkListingImportError("bulk_media_missing", "Assigned media file is missing.");
      }

      const kind = getBulkListingMediaKind({
        name: savedPhoto?.fileName ?? file!.name,
        type: savedPhoto?.contentType ?? file!.type
      });

      if (!kind) {
        throw new BulkListingImportError("bulk_media_type_invalid", "Media file type is invalid.");
      }

      // Copy one original at a time. Listing and inbox lifecycles stay independent,
      // and large saved-photo batches never become one large HTTP upload or buffer.
      const body = savedPhoto
        ? (await storageAdapter.read(savedPhoto.storageKey)).body
        : Buffer.from(await file!.arrayBuffer());
      if (savedPhoto && body.length !== savedPhoto.sizeBytes) {
        throw new BulkListingImportError("bulk_saved_photo_changed", "A saved photo could not be read intact. Refresh the inbox and try again.");
      }
      const storedAsset = await storageAdapter.save({
        body,
        contentType: savedPhoto?.contentType ?? (file!.type || "application/octet-stream"),
        fileName: savedPhoto?.fileName ?? file!.name
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
      if (input.workspace) {
        await lockWorkspace(transaction, input.workspace.id);
        const current = await transaction.bulkWorkspace.findFirst({ where: { id: input.workspace.id, sellerUserId: input.sellerUserId } });
        if (!current || current.version !== input.workspace.version || current.listingIds.length) throw new BulkListingImportError("workspace_conflict", "This saved batch has changed or already created listings. Resume it to see the latest result.");
      }
      const reservedSlugs = new Set<string>();
      const listingIds: string[] = [];
      const now = input.now ?? new Date();
      if (input.saveAs === "published" && preparedItems.some((item) => item.validatedListing.endAtUtc && item.validatedListing.endAtUtc.getTime() <= now.getTime())) {
        throw new BulkListingImportError("end_at_utc_invalid", "The auction ending passed during upload. Choose a later ending and try again; no listings were created.");
      }

      // Reserve explicit SKUs before automatic rows so a later manual number
      // cannot collide with an automatic number earlier in the same import.
      const creationOrder = preparedItems.map((item, index) => ({ item, index }))
        .sort((left, right) => Number(Boolean(right.item.sku)) - Number(Boolean(left.item.sku)));
      for (const { item, index: originalIndex } of creationOrder) {
        const validatedListing = item.validatedListing;
        const listingSlug = await buildUniqueListingSlug(
          transaction,
          slugify(validatedListing.title),
          reservedSlugs
        );
        const listing = await transaction.listing.create({
          data: {
            sku: item.sku,
            archivedAtUtc: null,
            categoryId: validatedListing.categoryId,
            conditionNote: validatedListing.conditionNote,
            description: validatedListing.description,
            fixedPriceCents: validatedListing.fixedPriceCents,
            fulfillmentMode: validatedListing.fulfillmentMode,
            listingType: validatedListing.listingType,
            pickupEventId: null,
            publishedAtUtc: input.saveAs === "published" ? now : null,
            sellerUserId: input.sellerUserId,
            shippingFeeCents: validatedListing.shippingFeeCents,
            shippingNotes: validatedListing.shippingNotes,
            slug: listingSlug,
            status: input.saveAs === "published" ? "published" : "draft",
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

        listingIds[originalIndex] = listing.id;
      }

      if (input.workspace) {
        await transaction.bulkWorkspace.update({ where: { id: input.workspace.id }, data: { listingIds, version: { increment: 1 } } });
        // Listing images now have their own independent copies.
        await transaction.bulkWorkspacePhoto.deleteMany({ where: { workspaceId: input.workspace.id } });
      }
      return listingIds;
    }, { timeout: 30_000 });

    return {
      listingIds: createdListingIds,
      warnings: issues.filter((issue) => issue.severity === "warning")
    };
  } catch (error) {
    await cleanupStoredMedia(storedMedia);
    try { rethrowListingSkuError(error); }
    catch (mappedError) {
      if (mappedError instanceof CatalogValidationError) {
        throw new BulkListingImportError(mappedError.code, mappedError.message, [{ code: mappedError.code, message: mappedError.message, severity: "error" }]);
      }
      throw mappedError;
    }
  }
}
