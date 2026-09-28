import { CatalogValidationError, listingImageMaxSizeBytes } from "./index";
import { bulkListingImageAcceptedMimeTypes, bulkListingMaxRequestSizeBytes } from "./bulk-listings";

export const photoInboxMaxCount = 100;
export type InboxPhotoMetadata = Pick<File, "name" | "size" | "type">;

export function formatPhotoSize(bytes: number) {
  return bytes === 0 ? "0 bytes" : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function inboxPhotoIssue(file: InboxPhotoMetadata) {
  const label = `“${file.name}” (${formatPhotoSize(file.size)})`;
  if (!Number.isSafeInteger(file.size) || file.size < 1) return {
    code: "photo_empty",
    message: `${label} is empty or could not be read. Download the original photo to your device, then select it again.`
  };
  if (file.size > listingImageMaxSizeBytes) return {
    code: "photo_too_large",
    message: `${label} is larger than the ${listingImageMaxSizeBytes / (1024 * 1024)} MB limit (${file.size.toLocaleString("en-US")} bytes). Choose a smaller copy.`
  };
  if (!(bulkListingImageAcceptedMimeTypes as readonly string[]).includes(file.type)) return {
    code: "photo_type_invalid",
    message: `${label} has an unsupported format (${file.type || "unknown"}). Use JPEG, PNG, or WebP; export HEIC photos as JPEG first.`
  };
  return null;
}

export function validateInboxSelection(files: InboxPhotoMetadata[]) {
  if (!files.length || files.length > photoInboxMaxCount) throw new CatalogValidationError("photos_required", `Choose 1 to ${photoInboxMaxCount} photos.`);
  if (files.reduce((size, file) => size + file.size, 0) > bulkListingMaxRequestSizeBytes) throw new CatalogValidationError("photos_too_large", `Choose up to ${bulkListingMaxRequestSizeBytes / (1024 * 1024)} MB of photos at a time.`);
}

export function validateInboxPhotos(files: InboxPhotoMetadata[]) {
  validateInboxSelection(files);
  for (const file of files) {
    const issue = inboxPhotoIssue(file);
    if (issue) throw new CatalogValidationError(issue.code, issue.message);
  }
}

/** Optional client manifest distinguishes a damaged transfer from a genuine size violation. */
export function validateInboxTransfer(files: InboxPhotoMetadata[], manifest: FormDataEntryValue | null) {
  if (manifest === null) return;
  let expected: unknown;
  try { expected = typeof manifest === "string" ? JSON.parse(manifest) : null; } catch { expected = null; }
  if (!Array.isArray(expected) || expected.length !== files.length || expected.some((item) => !item || typeof item.name !== "string" || !Number.isSafeInteger(item.size) || item.size < 1)) {
    throw new CatalogValidationError("photo_manifest_invalid", "Photo details could not be read. Select the photos again and retry.");
  }
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const original = expected[index];
    if (file.size !== original.size) throw new CatalogValidationError("photo_transfer_incomplete", `“${original.name}” did not arrive intact: expected ${formatPhotoSize(original.size)}, received ${formatPhotoSize(file.size)}. Download the original to your device and retry with a stable connection.`);
  }
}
