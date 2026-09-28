import { inboxPhotoIssue, validateInboxSelection } from "./photo-inbox-validation";
import type { SavedInboxPhoto } from "./photo-inbox-presentation";
export type { SavedInboxPhoto } from "./photo-inbox-presentation";

export type CheckedInboxPhoto = { file: File; hash?: string; status: "ready" | "duplicate" | "failed"; error?: string; existing?: SavedInboxPhoto };

async function readOriginal(file: File) {
  const issue = inboxPhotoIssue(file);
  if (issue) throw new Error(issue.message);
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); } catch {
    throw new Error(`“${file.name}” could not be read from your device. Download the original photo, then select it again.`);
  }
  if (bytes.byteLength !== file.size) throw new Error(`“${file.name}” could not be read completely. Download the original photo to your device, then select it again.`);
  return bytes;
}

/** Only fingerprints leave the device during this check; photo bytes are not uploaded. */
export async function checkInboxPhotos(files: File[], send: typeof fetch = fetch, onProgress?: (count: number) => void): Promise<CheckedInboxPhoto[]> {
  validateInboxSelection(files);
  const entries: CheckedInboxPhoto[] = [];
  for (const file of files) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", await readOriginal(file));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      entries.push({ file, hash, status: "ready" });
    } catch (error) { entries.push({ file, status: "failed", error: error instanceof Error ? error.message : "Could not read this photo. Select it again." }); }
    onProgress?.(entries.length);
  }
  const hashes = [...new Set(entries.flatMap((entry) => entry.hash ? [entry.hash] : []))];
  if (!hashes.length) return entries;
  let response: Response;
  try { response = await send("/api/admin/photos/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }); }
  catch { throw new Error("Could not check your inbox. Check your connection and select the photos again. No photos were uploaded."); }
  if (response.redirected || response.status === 401 || response.status === 403) throw new Error("Sign in again to check for saved photos. No photos were uploaded.");
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.photos)) throw new Error(data?.message ?? "Could not check your inbox. Try again before uploading.");
  const existing = new Map<string, SavedInboxPhoto>();
  for (const photo of data.photos as SavedInboxPhoto[]) if (photo.contentHash && !existing.has(photo.contentHash)) existing.set(photo.contentHash, photo);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.hash) continue;
    entry.existing = existing.get(entry.hash);
    if (entry.existing || seen.has(entry.hash)) entry.status = "duplicate";
    seen.add(entry.hash);
  }
  return entries;
}

/** Read one original at a time so cloud placeholders fail clearly and phone memory stays bounded. */
export async function uploadInboxPhoto(file: File, send: typeof fetch = fetch): Promise<SavedInboxPhoto> {
  const bytes = await readOriginal(file);
  const data = new FormData();
  data.append("photos", new Blob([bytes], { type: file.type }), file.name);
  data.set("photoManifest", JSON.stringify([{ name: file.name, size: file.size, lastModified: file.lastModified }]));
  data.set("sourceTimeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  let response: Response;
  try { response = await send("/api/admin/photos", { method: "POST", body: data }); } catch {
    throw new Error(`The connection stopped while saving “${file.name}”. Refresh the saved photos to check whether it arrived before retrying.`);
  }
  if (response.redirected || response.status === 401 || response.status === 403) throw new Error("Your sign-in has expired or access was denied. Sign in again before retrying. Photos already saved remain in your inbox.");
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof result?.message === "string") throw new Error(result.message);
    if (response.status === 413) throw new Error(`The server rejected “${file.name}” as too large. Refresh this page for the latest upload limits and try again.`);
    throw new Error(`“${file.name}” could not be saved (server response ${response.status}). Refresh the saved photos before retrying.`);
  }
  const saved = result?.photos?.[0];
  if (!saved?.id || saved.sizeBytes !== file.size) throw new Error(`The server did not confirm a complete save for “${file.name}”. Refresh the saved photos before retrying.`);
  return saved;
}
