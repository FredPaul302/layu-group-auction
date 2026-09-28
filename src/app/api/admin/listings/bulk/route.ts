import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import {
  bulkListingMaxRequestSizeBytes,
  bulkListingMaxBodySizeBytes,
  bulkListingMaxItems,
  bulkListingVideoMaxSizeBytes,
  type BulkListingItemInput,
  type BulkListingSavedPhotoReference
} from "@/lib/catalog/bulk-listings";
import {
  BulkListingImportError,
  createDraftListingsFromBulkWorkspace
} from "@/lib/catalog/bulk-listing-service";
import { listingImageMaxCount } from "@/lib/catalog";
import { readMultipartUpload, MultipartUploadError } from "@/lib/storage/multipart-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkListingPayload = {
  allowIncompleteDraftRows?: boolean;
  saveAs?: "draft" | "published";
  items: BulkListingItemInput[];
  savedPhotos?: BulkListingSavedPhotoReference[];
  savedAssets?: { id: string; assetId: string }[];
  workspace?: { id: string; version: number };
};

function parseContentLength(request: NextRequest) {
  const value = request.headers.get("content-length");

  if (!value) {
    return null;
  }

  if (!/^\d+$/u.test(value)) {
    return Number.NaN;
  }

  return Number.parseInt(value, 10);
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePayload(value: FormDataEntryValue | null): BulkListingPayload {
  if (typeof value !== "string") {
    throw new BulkListingImportError("bulk_payload_missing", "Bulk listing payload is required.");
  }

  const parsedValue = JSON.parse(value) as unknown;

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    !("items" in parsedValue) ||
    !Array.isArray(parsedValue.items)
  ) {
    throw new BulkListingImportError("bulk_payload_invalid", "Bulk listing payload is invalid.");
  }

  const parsedPayload = parsedValue as {
    allowIncompleteDraftRows?: unknown;
    saveAs?: unknown;
    items: Array<Record<string, unknown>>;
    savedPhotos?: unknown;
    savedAssets?: unknown;
    workspace?: unknown;
  };
  const workspace = parsedPayload.workspace as { id?: unknown; version?: unknown } | undefined;
  if (parsedPayload.workspace !== undefined && (!workspace || typeof workspace.id !== "string" || workspace.id.length > 100 || !Number.isSafeInteger(workspace.version) || Number(workspace.version) < 1)) throw new BulkListingImportError("workspace_invalid", "Invalid saved batch.");
  if (parsedPayload.savedAssets !== undefined && (!Array.isArray(parsedPayload.savedAssets) || parsedPayload.savedAssets.length > 900 || parsedPayload.savedAssets.some((entry) => !entry || typeof entry.id !== "string" || entry.id.length > 150 || typeof entry.assetId !== "string" || entry.assetId.length > 100))) throw new BulkListingImportError("workspace_assets_invalid", "Invalid saved attachments.");
  if (parsedPayload.savedPhotos !== undefined && (!Array.isArray(parsedPayload.savedPhotos) ||
    parsedPayload.savedPhotos.length > bulkListingMaxItems * listingImageMaxCount ||
    parsedPayload.savedPhotos.some((entry) => !entry || typeof entry !== "object" ||
      typeof entry.id !== "string" || !entry.id || entry.id.length > 150 ||
      typeof entry.savedPhotoId !== "string" || !entry.savedPhotoId || entry.savedPhotoId.length > 100))) {
    throw new BulkListingImportError("bulk_saved_photos_invalid", "Saved photo selection is invalid. Refresh the inbox and select your photos again.");
  }
  if (parsedPayload.saveAs !== undefined && !["draft", "published"].includes(String(parsedPayload.saveAs))) throw new BulkListingImportError("bulk_save_mode_invalid", "Choose draft or publish now.");
  const items = parsedPayload.items.map((item, index) => ({
    bidIncrementCents:
      typeof item.bidIncrementCents === "string" ? item.bidIncrementCents : "",
    categorySlug: typeof item.categorySlug === "string" ? item.categorySlug : "",
    clientId: typeof item.clientId === "string" ? item.clientId : `item-${index + 1}`,
    condition: typeof item.condition === "string" ? item.condition : "",
    description: typeof item.description === "string" ? item.description : "",
    endAtUtc: typeof item.endAtUtc === "string" ? item.endAtUtc : "",
    imageFileIds: normalizeStringArray(item.imageFileIds),
    imageOrder: normalizeStringArray(item.imageOrder),
    listingType:
      typeof item.listingType === "string"
        ? (item.listingType as BulkListingItemInput["listingType"])
        : "auction",
    mediaPrefix: typeof item.mediaPrefix === "string" ? item.mediaPrefix : "",
    priceCents: typeof item.priceCents === "string" ? item.priceCents : "",
    primaryImageFileId:
      typeof item.primaryImageFileId === "string" ? item.primaryImageFileId : null,
    quantity: typeof item.quantity === "string" ? item.quantity : "",
    sku: typeof item.sku === "string" ? item.sku : "",
    startingBidCents:
      typeof item.startingBidCents === "string" ? item.startingBidCents : "",
    status: typeof item.status === "string" ? item.status : "",
    title: typeof item.title === "string" ? item.title : "",
    videoFileIds: normalizeStringArray(item.videoFileIds)
  })) satisfies BulkListingItemInput[];

  return {
    allowIncompleteDraftRows: parsedPayload.allowIncompleteDraftRows === true,
    ...(parsedPayload.saveAs ? { saveAs: parsedPayload.saveAs as "draft" | "published" } : {}),
    items,
    ...(workspace ? { workspace: workspace as { id: string; version: number } } : {}),
    ...(parsedPayload.savedAssets ? { savedAssets: parsedPayload.savedAssets as { id: string; assetId: string }[] } : {}),
    ...(parsedPayload.savedPhotos ? { savedPhotos: (parsedPayload.savedPhotos as BulkListingSavedPhotoReference[]).map(({ id, savedPhotoId }) => ({ id, savedPhotoId })) } : {})
  };
}

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const auth = await requireAdminRequestUser(request);

  if (auth.response) {
    return auth.response;
  }

  const contentLength = parseContentLength(request);

  if (Number.isNaN(contentLength) || (contentLength ?? 0) > bulkListingMaxBodySizeBytes) {
    return NextResponse.json(
      {
        message: `Bulk upload is limited to ${bulkListingMaxRequestSizeBytes / (1024 * 1024)} MB. Split this batch and try again.`,
        status: "bulk_request_too_large"
      },
      {
        status: 413
      }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      {
        message: "Bulk listing creation requires multipart form data.",
        status: "unsupported_media_type"
      },
      {
        status: 415
      }
    );
  }

  let upload: Awaited<ReturnType<typeof readMultipartUpload>> | undefined;
  try {
    upload = await readMultipartUpload(request, { bodyBytes: bulkListingMaxBodySizeBytes, fileBytes: bulkListingVideoMaxSizeBytes, files: bulkListingMaxItems * (listingImageMaxCount + 1) });
    const formData = upload.formData;
    const payload = normalizePayload(formData.get("payload"));
    const seenFileIds = new Set<string>();
    const files: Array<{ file: File; id: string }> = [];

    for (const [name, value] of formData.entries()) {
      if (!name.startsWith("media:")) {
        continue;
      }

      const id = name.slice("media:".length);

      if (!id || seenFileIds.has(id)) {
        throw new BulkListingImportError(
          "bulk_media_id_invalid",
          "Submitted media files must have unique IDs."
        );
      }

      seenFileIds.add(id);

      if (!(value instanceof File) || value.size <= 0) {
        throw new BulkListingImportError(
          "bulk_media_missing",
          "Submitted media file is missing or empty."
        );
      }

      files.push({
        file: value,
        id
      });
    }

    const result = await createDraftListingsFromBulkWorkspace({
      allowIncompleteDraftRows: payload.allowIncompleteDraftRows,
      ...(payload.saveAs ? { saveAs: payload.saveAs } : {}),
      files,
      ...(payload.workspace ? { workspace: payload.workspace } : {}),
      ...(payload.savedAssets ? { savedAssets: payload.savedAssets } : {}),
      ...(payload.savedPhotos ? { savedPhotos: payload.savedPhotos } : {}),
      items: payload.items,
      sellerUserId: auth.user.id
    });

    return NextResponse.json({
      listingIds: result.listingIds,
      status: "bulk_listings_created",
      warnings: result.warnings
    });
  } catch (error) {
    if (error instanceof MultipartUploadError) return NextResponse.json({ status: error.code, message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          message: "Bulk listing payload JSON is invalid.",
          status: "bulk_payload_invalid"
        },
        {
          status: 400
        }
      );
    }

    if (error instanceof BulkListingImportError) {
      return NextResponse.json(
        {
          issues: error.issues,
          message: error.message,
          status: error.code
        },
        {
          status: 422
        }
      );
    }

    console.warn("Bulk listing creation failed unexpectedly", {
      error
    });

    return NextResponse.json(
      {
        message: "Bulk listing creation failed unexpectedly.",
        status: "unexpected"
      },
      {
        status: 500
      }
    );
  } finally { await upload?.cleanup(); }
}
