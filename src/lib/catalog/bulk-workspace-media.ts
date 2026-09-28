import type { SavedInboxPhoto } from "./upload-inbox-photo";

export type BulkWorkspaceMedia = {
  id: string;
  file: Pick<File, "name" | "size" | "type" | "lastModified">;
  savedPhotoId?: string;
  savedAssetId?: string;
};

export function savedPhotoMedia(photo: SavedInboxPhoto): BulkWorkspaceMedia {
  return {
    id: `inbox-${photo.id}`,
    savedPhotoId: photo.id,
    file: {
      name: photo.fileName, size: photo.sizeBytes, type: photo.contentType,
      lastModified: Date.parse(photo.fileModifiedAtUtc ?? photo.capturedAtUtc ?? photo.createdAtUtc)
    }
  };
}

export function localMediaFiles(entries: BulkWorkspaceMedia[]): File[] {
  return entries.flatMap((entry) => entry.file instanceof File && !entry.savedAssetId ? [entry.file] : []);
}

export function savedMediaUrl(entry: BulkWorkspaceMedia) {
  return entry.savedPhotoId ? `/api/admin/photos/${encodeURIComponent(entry.savedPhotoId)}`
    : entry.savedAssetId ? `/api/admin/listings/workspace-media/${encodeURIComponent(entry.savedAssetId)}` : null;
}

export function savedMediaPreviews(entries: BulkWorkspaceMedia[]) {
  return entries.flatMap((entry) => savedMediaUrl(entry) ? [{
    id: entry.id, filename: entry.file.name, src: savedMediaUrl(entry)!
  }] : []);
}

/** Only load the few images needed by the current AI job, never the entire batch. */
export async function loadBulkDescriptionFiles(entries: BulkWorkspaceMedia[], signal: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const files: File[] = [];
  for (const entry of entries) {
    signal.throwIfAborted();
    if (entry.file instanceof File) { files.push(entry.file); continue; }
    const url = savedMediaUrl(entry);
    if (!url) throw new Error(`Select ${entry.file.name} again.`);
    const response = await fetchImpl(url, { signal });
    if (!response.ok || response.redirected) throw new Error(`Could not load ${entry.file.name}. Refresh the photo inbox and try again.`);
    files.push(new File([await response.blob()], entry.file.name, { type: entry.file.type, lastModified: entry.file.lastModified }));
  }
  return files;
}
