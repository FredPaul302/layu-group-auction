import {
  listingImageMaxCount,
  listingImageMaxSizeBytes,
  parseOptionalText
} from "./index";

export const bulkListingMaxItems = 25;
export const bulkListingMaxRequestSizeBytes = 128 * 1024 * 1024;
export const bulkListingImageAcceptedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;
export const bulkListingImageAcceptedExtensions = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const bulkListingVideoAcceptedMimeTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm"
] as const;
export const bulkListingVideoAcceptedExtensions = [".mp4", ".mov", ".webm"] as const;
export const bulkListingVideoMaxCount = 1;
export const bulkListingVideoMaxSizeBytes = 50 * 1024 * 1024;

export type BulkListingType = "auction" | "fixed_price";
export type BulkListingMediaKind = "image" | "video";

export type BulkListingItemInput = {
  bidIncrementCents?: string | null;
  categorySlug: string;
  clientId: string;
  condition?: string | null;
  description: string;
  endAtUtc?: string | null;
  imageFileIds: string[];
  imageOrder?: string[];
  listingType: BulkListingType;
  mediaPrefix?: string | null;
  priceCents?: string | null;
  primaryImageFileId?: string | null;
  quantity?: string | null;
  sku: string;
  startingBidCents?: string | null;
  status?: string | null;
  title: string;
  videoFileIds: string[];
};

export type BulkListingMediaInput = {
  id: string;
  lastModified?: number;
  name: string;
  size: number;
  type: string;
};

export type BulkListingValidationIssue = {
  code: string;
  fileId?: string;
  itemClientId?: string;
  message: string;
  severity: "error" | "warning";
};

export type BulkListingValidationResult = {
  hasErrors: boolean;
  issues: BulkListingValidationIssue[];
};

const requiredCsvColumns = [
  "sku",
  "title",
  "description",
  "listingType",
  "categorySlug"
] as const;

const optionalCsvColumns = [
  "priceCents",
  "startingBidCents",
  "bidIncrementCents",
  "condition",
  "quantity",
  "mediaPrefix",
  "status",
  "endAtUtc"
] as const;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeMatchValue(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function getFileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[a-z0-9]+$/u)?.[0] ?? "";
}

function isAcceptedImageExtension(extension: string) {
  return bulkListingImageAcceptedExtensions.includes(
    extension as (typeof bulkListingImageAcceptedExtensions)[number]
  );
}

function isAcceptedVideoExtension(extension: string) {
  return bulkListingVideoAcceptedExtensions.includes(
    extension as (typeof bulkListingVideoAcceptedExtensions)[number]
  );
}

function isAcceptedImageMimeType(type: string) {
  return bulkListingImageAcceptedMimeTypes.includes(
    type as (typeof bulkListingImageAcceptedMimeTypes)[number]
  );
}

function isAcceptedVideoMimeType(type: string) {
  return bulkListingVideoAcceptedMimeTypes.includes(
    type as (typeof bulkListingVideoAcceptedMimeTypes)[number]
  );
}

function classifyBulkMedia(input: Pick<BulkListingMediaInput, "name" | "type">) {
  const extension = getFileExtension(input.name);

  if (isAcceptedImageExtension(extension) && isAcceptedImageMimeType(input.type)) {
    return "image" satisfies BulkListingMediaKind;
  }

  if (isAcceptedVideoExtension(extension) && isAcceptedVideoMimeType(input.type)) {
    return "video" satisfies BulkListingMediaKind;
  }

  return null;
}

function parseWholeCents(value: string | null | undefined) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  if (!/^\d+$/u.test(normalizedValue)) {
    return Number.NaN;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN;
}

function parseCsvCells(csvText: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function parseBulkListingCsv(csvText: string) {
  const rows = parseCsvCells(csvText);
  const issues: BulkListingValidationIssue[] = [];

  if (rows.length === 0) {
    return {
      items: [] satisfies BulkListingItemInput[],
      issues: [
        {
          code: "csv_empty",
          message: "CSV import is empty.",
          severity: "error" as const
        }
      ]
    };
  }

  const headerRow = rows[0].map((header) => header.trim());
  const headerMap = new Map(headerRow.map((header, index) => [header, index]));

  for (const column of requiredCsvColumns) {
    if (!headerMap.has(column)) {
      issues.push({
        code: "csv_column_missing",
        message: `CSV is missing required column ${column}.`,
        severity: "error"
      });
    }
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      items: [] satisfies BulkListingItemInput[],
      issues
    };
  }

  const supportedColumns = new Set<string>([...requiredCsvColumns, ...optionalCsvColumns]);
  for (const column of headerRow) {
    if (column && !supportedColumns.has(column)) {
      issues.push({
        code: "csv_column_ignored",
        message: `CSV column ${column} is not used by the bulk workspace.`,
        severity: "warning"
      });
    }
  }

  const items = rows.slice(1).map((row, index) => {
    const getColumn = (column: string) => {
      const columnIndex = headerMap.get(column);
      return columnIndex == null ? "" : normalizeText(row[columnIndex]);
    };

    const listingType = getColumn("listingType") as BulkListingType;

    return {
      bidIncrementCents: getColumn("bidIncrementCents"),
      categorySlug: getColumn("categorySlug"),
      clientId: `csv-${index + 1}`,
      condition: getColumn("condition"),
      description: getColumn("description"),
      endAtUtc: getColumn("endAtUtc"),
      imageFileIds: [],
      imageOrder: [],
      listingType,
      mediaPrefix: getColumn("mediaPrefix"),
      priceCents: getColumn("priceCents"),
      primaryImageFileId: null,
      quantity: getColumn("quantity"),
      sku: getColumn("sku"),
      startingBidCents: getColumn("startingBidCents"),
      status: getColumn("status"),
      title: getColumn("title"),
      videoFileIds: []
    } satisfies BulkListingItemInput;
  });

  return {
    items,
    issues
  };
}

export function getBulkListingMediaKind(media: Pick<BulkListingMediaInput, "name" | "type">) {
  return classifyBulkMedia(media);
}

export function buildStoredAssetRoute(key: string) {
  return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function getBulkListingMatchPrefix(item: Pick<BulkListingItemInput, "mediaPrefix" | "sku">) {
  return parseOptionalText(item.mediaPrefix) ?? normalizeText(item.sku);
}

export function matchBulkListingMedia(
  items: BulkListingItemInput[],
  media: BulkListingMediaInput[]
) {
  const assignments = new Map<
    string,
    {
      imageFileIds: string[];
      primaryImageFileId: string | null;
      videoFileIds: string[];
    }
  >();
  const unassignedFileIds: string[] = [];

  for (const item of items) {
    assignments.set(item.clientId, {
      imageFileIds: [],
      primaryImageFileId: null,
      videoFileIds: []
    });
  }

  for (const file of media) {
    const kind = classifyBulkMedia(file);
    const fileName = normalizeMatchValue(file.name);
    const candidates = items
      .map((item) => ({
        item,
        prefix: normalizeMatchValue(getBulkListingMatchPrefix(item))
      }))
      .filter((candidate) => candidate.prefix && fileName.startsWith(candidate.prefix))
      .sort((left, right) => right.prefix.length - left.prefix.length);

    if (!kind || candidates.length === 0) {
      unassignedFileIds.push(file.id);
      continue;
    }

    const selectedItem = candidates[0].item;
    const assignment = assignments.get(selectedItem.clientId);

    if (!assignment) {
      unassignedFileIds.push(file.id);
      continue;
    }

    if (kind === "image") {
      assignment.imageFileIds.push(file.id);
      assignment.primaryImageFileId ??= file.id;
    } else {
      assignment.videoFileIds.push(file.id);
    }
  }

  return {
    assignments,
    unassignedFileIds
  };
}

export function validateBulkListingWorkspace(input: {
  allowIncompleteDraftRows?: boolean;
  items: BulkListingItemInput[];
  media: BulkListingMediaInput[];
}) {
  const issues: BulkListingValidationIssue[] = [];
  const mediaById = new Map(input.media.map((media) => [media.id, media]));
  const assignedFileIds = new Map<string, string>();
  const totalSelectedBytes = input.media.reduce((sum, media) => sum + media.size, 0);

  if (input.items.length === 0) {
    issues.push({
      code: "bulk_items_missing",
      message: "Add at least one listing row before creating drafts.",
      severity: "error"
    });
  }

  if (input.items.length > bulkListingMaxItems) {
    issues.push({
      code: "bulk_items_too_many",
      message: `Bulk creation is limited to ${bulkListingMaxItems} listings per batch.`,
      severity: "error"
    });
  }

  if (totalSelectedBytes > bulkListingMaxRequestSizeBytes) {
    issues.push({
      code: "bulk_request_too_large",
      message: "Selected uploads exceed 128 MB. Split this batch before submitting.",
      severity: "error"
    });
  }

  for (const media of input.media) {
    const kind = classifyBulkMedia(media);

    if (!kind) {
      issues.push({
        code: "bulk_media_type_invalid",
        fileId: media.id,
        message:
          "Media files must be JPG, PNG, WebP, MP4, MOV, or WebM with matching browser MIME types.",
        severity: "error"
      });
      continue;
    }

    if (kind === "image" && media.size > listingImageMaxSizeBytes) {
      issues.push({
        code: "bulk_image_size_invalid",
        fileId: media.id,
        message: `Images must be ${Math.floor(listingImageMaxSizeBytes / (1024 * 1024))} MB or smaller.`,
        severity: "error"
      });
    }

    if (kind === "video" && media.size > bulkListingVideoMaxSizeBytes) {
      issues.push({
        code: "bulk_video_size_invalid",
        fileId: media.id,
        message: `Videos must be ${Math.floor(bulkListingVideoMaxSizeBytes / (1024 * 1024))} MB or smaller.`,
        severity: "error"
      });
    }
  }

  for (const item of input.items) {
    const sku = normalizeText(item.sku);
    const title = normalizeText(item.title);
    const description = normalizeText(item.description);
    const categorySlug = normalizeText(item.categorySlug);
    const allItemFileIds = [...item.imageFileIds, ...item.videoFileIds];

    if (!sku) {
      issues.push({
        code: "bulk_sku_required",
        itemClientId: item.clientId,
        message: "SKU is required.",
        severity: "error"
      });
    }

    if (!title) {
      issues.push({
        code: "bulk_title_required",
        itemClientId: item.clientId,
        message: "Title is required.",
        severity: "error"
      });
    }

    if (!description) {
      issues.push({
        code: "bulk_description_required",
        itemClientId: item.clientId,
        message: "Description is required.",
        severity: "error"
      });
    }

    if (!categorySlug) {
      issues.push({
        code: "bulk_category_required",
        itemClientId: item.clientId,
        message: "Category slug is required.",
        severity: "error"
      });
    }

    if (item.listingType !== "auction" && item.listingType !== "fixed_price") {
      issues.push({
        code: "bulk_listing_type_invalid",
        itemClientId: item.clientId,
        message: "Listing type must be fixed_price or auction.",
        severity: "error"
      });
    }

    if (item.listingType === "fixed_price") {
      const priceCents = parseWholeCents(item.priceCents);

      if (priceCents == null || Number.isNaN(priceCents) || priceCents <= 0) {
        issues.push({
          code: "bulk_price_required",
          itemClientId: item.clientId,
          message: "Fixed-price rows require priceCents greater than zero.",
          severity: "error"
        });
      }
    }

    if (item.listingType === "auction") {
      const startingBidCents = parseWholeCents(item.startingBidCents);

      if (
        startingBidCents == null ||
        Number.isNaN(startingBidCents) ||
        startingBidCents < 0
      ) {
        issues.push({
          code: "bulk_starting_bid_required",
          itemClientId: item.clientId,
          message: "Auction rows require startingBidCents.",
          severity: "error"
        });
      }

      if (!normalizeText(item.endAtUtc)) {
        issues.push({
          code: "bulk_end_at_required",
          itemClientId: item.clientId,
          message: "Auction draft rows require endAtUtc for auction configuration.",
          severity: "error"
        });
      } else if (Number.isNaN(new Date(normalizeText(item.endAtUtc)).getTime())) {
        issues.push({
          code: "bulk_end_at_invalid",
          itemClientId: item.clientId,
          message: "Auction endAtUtc must be a valid date and time.",
          severity: "error"
        });
      }
    }

    if (normalizeText(item.status) && normalizeText(item.status) !== "draft") {
      issues.push({
        code: "bulk_status_forced_draft",
        itemClientId: item.clientId,
        message: "Status input is ignored; bulk import always creates draft listings.",
        severity: "warning"
      });
    }

    if (normalizeText(item.quantity)) {
      issues.push({
        code: "bulk_quantity_ignored",
        itemClientId: item.clientId,
        message: "Quantity is not supported by the current listing schema and will be ignored.",
        severity: "warning"
      });
    }

    if (normalizeText(item.bidIncrementCents)) {
      issues.push({
        code: "bulk_bid_increment_ignored",
        itemClientId: item.clientId,
        message: "Bid increments are controlled by category settings and will be ignored.",
        severity: "warning"
      });
    }

    if (!input.allowIncompleteDraftRows && item.imageFileIds.length === 0) {
      issues.push({
        code: "bulk_images_required",
        itemClientId: item.clientId,
        message: "Each bulk listing row requires at least one image.",
        severity: "error"
      });
    }

    if (item.imageFileIds.length > listingImageMaxCount) {
      issues.push({
        code: "bulk_images_too_many",
        itemClientId: item.clientId,
        message: `Each listing can include up to ${listingImageMaxCount} images.`,
        severity: "error"
      });
    }

    if (item.videoFileIds.length > bulkListingVideoMaxCount) {
      issues.push({
        code: "bulk_videos_too_many",
        itemClientId: item.clientId,
        message: `Each listing can include up to ${bulkListingVideoMaxCount} video.`,
        severity: "error"
      });
    }

    for (const fileId of allItemFileIds) {
      const media = mediaById.get(fileId);

      if (!media) {
        issues.push({
          code: "bulk_media_missing",
          fileId,
          itemClientId: item.clientId,
          message: "Assigned media file was not submitted.",
          severity: "error"
        });
        continue;
      }

      const existingItemId = assignedFileIds.get(fileId);
      if (existingItemId && existingItemId !== item.clientId) {
        issues.push({
          code: "bulk_media_assigned_twice",
          fileId,
          itemClientId: item.clientId,
          message: "A media file can only be assigned to one listing row.",
          severity: "error"
        });
      }

      assignedFileIds.set(fileId, item.clientId);
    }

    for (const fileId of item.imageFileIds) {
      const media = mediaById.get(fileId);
      if (media && classifyBulkMedia(media) !== "image") {
        issues.push({
          code: "bulk_image_assignment_invalid",
          fileId,
          itemClientId: item.clientId,
          message: "Only image files can be assigned as listing images.",
          severity: "error"
        });
      }
    }

    for (const fileId of item.videoFileIds) {
      const media = mediaById.get(fileId);
      if (media && classifyBulkMedia(media) !== "video") {
        issues.push({
          code: "bulk_video_assignment_invalid",
          fileId,
          itemClientId: item.clientId,
          message: "Only video files can be assigned as listing videos.",
          severity: "error"
        });
      }
    }

    if (item.primaryImageFileId && !item.imageFileIds.includes(item.primaryImageFileId)) {
      issues.push({
        code: "bulk_primary_image_invalid",
        fileId: item.primaryImageFileId,
        itemClientId: item.clientId,
        message: "Primary image must be assigned to the same listing row.",
        severity: "error"
      });
    }
  }

  for (const media of input.media) {
    if (!assignedFileIds.has(media.id)) {
      issues.push({
        code: "bulk_media_unassigned",
        fileId: media.id,
        message: "Every submitted media file must be assigned to a listing row before creation.",
        severity: "error"
      });
    }
  }

  return {
    hasErrors: issues.some((issue) => issue.severity === "error"),
    issues
  } satisfies BulkListingValidationResult;
}
