export const descriptionPhotoMaxCount = 3;
export const descriptionPhotoMaxDimension = 1024;
export const descriptionPhotoMaxBytes = 256 * 1024;
export const descriptionPhotoMaxSourceBytes = 20 * 1024 * 1024;
export const descriptionPhotoAcceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export function getDescriptionPhotoDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 64_000_000) {
    throw new Error("This photo could not be prepared. Use a standard photo up to 64 megapixels.");
  }
  const scale = Math.min(1, descriptionPhotoMaxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validateDescriptionSourcePhoto(file: Pick<File, "type" | "size">) {
  if (!(descriptionPhotoAcceptedTypes as readonly string[]).includes(file.type)) {
    throw new Error("For AI descriptions, use JPEG, PNG, WebP, or AVIF photos. Convert HEIC files first; videos are not analyzed.");
  }
  if (file.size <= 0 || file.size > descriptionPhotoMaxSourceBytes) {
    throw new Error("Each source photo for AI must be nonempty and 20 MB or smaller.");
  }
}
