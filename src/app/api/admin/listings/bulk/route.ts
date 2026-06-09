import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import {
  bulkListingMaxRequestSizeBytes,
  type BulkListingItemInput
} from "@/lib/catalog/bulk-listings";
import {
  BulkListingImportError,
  createDraftListingsFromBulkWorkspace
} from "@/lib/catalog/bulk-listing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkListingPayload = {
  allowIncompleteDraftRows?: boolean;
  items: BulkListingItemInput[];
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
    items: Array<Record<string, unknown>>;
  };
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
    items
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

  if (Number.isNaN(contentLength) || (contentLength ?? 0) > bulkListingMaxRequestSizeBytes) {
    return NextResponse.json(
      {
        message: "Bulk upload is limited to 128 MB. Split this batch and try again.",
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

  try {
    const formData = await request.formData();
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
      files,
      items: payload.items,
      sellerUserId: auth.user.id
    });

    return NextResponse.json({
      listingIds: result.listingIds,
      status: "bulk_listings_created",
      warnings: result.warnings
    });
  } catch (error) {
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
  }
}
