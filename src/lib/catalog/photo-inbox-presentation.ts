export type SavedInboxPhoto = {
  id: string; fileName: string; sizeBytes: number; contentType: string; createdAtUtc: string;
  contentHash?: string | null; capturedAtUtc?: string | null; fileModifiedAtUtc?: string | null; photoDateSource?: string | null;
  alreadySaved?: boolean;
};
export const photoSortOptions = [
  ["photo_newest", "Photo date — newest first"], ["photo_oldest", "Photo date — oldest first"],
  ["upload_newest", "Upload date — newest first"], ["upload_oldest", "Upload date — oldest first"],
  ["name_asc", "Filename — A to Z"], ["name_desc", "Filename — Z to A"]
] as const;
export type PhotoSortOrder = typeof photoSortOptions[number][0];
export function photoDate(photo: SavedInboxPhoto) { return photo.capturedAtUtc ?? photo.fileModifiedAtUtc ?? photo.createdAtUtc; }
export function sortInboxPhotos(photos: SavedInboxPhoto[], order: PhotoSortOrder) {
  const direction = order.endsWith("oldest") || order === "name_asc" ? 1 : -1;
  return [...photos].sort((left, right) => {
    const name = left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: "base" });
    const difference = order.startsWith("name_") ? name : Date.parse(order.startsWith("upload_") ? left.createdAtUtc : photoDate(left)) - Date.parse(order.startsWith("upload_") ? right.createdAtUtc : photoDate(right));
    return direction * (difference || name) || left.id.localeCompare(right.id);
  });
}
export function photoDateLabel(photo: SavedInboxPhoto) {
  const date = new Date(photoDate(photo)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return photo.capturedAtUtc ? `Taken ${date}${photo.photoDateSource === "camera_timezone_assumed" ? " (time zone estimated)" : ""}` : photo.fileModifiedAtUtc ? `File date ${date} · capture time unavailable` : `Uploaded ${date} · capture time unavailable`;
}
