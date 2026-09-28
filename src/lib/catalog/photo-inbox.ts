import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { validateInboxPhotos } from "./photo-inbox-validation";
import { readPhotoMetadata, type PhotoSourceDetails } from "./photo-metadata";
import { savedPhotoSelect } from "./photo-inbox-select";
export { validateInboxPhotos } from "./photo-inbox-validation";

type Saved = Prisma.SavedPhotoGetPayload<{ select: typeof savedPhotoSelect }>;

export async function saveInboxPhotos(sellerUserId: string, files: File[], sources: PhotoSourceDetails[] = []) {
  validateInboxPhotos(files);
  const storage = getStorageAdapter();
  const staged: string[] = [];
  const candidates = new Map<string, { data?: Prisma.SavedPhotoUncheckedCreateInput }>();
  const hashes: string[] = [];
  let result: (Saved & { alreadySaved: boolean })[];
  const usedKeys = new Set<string>();
  try {
    for (const [index, file] of files.entries()) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const contentHash = createHash("sha256").update(bytes).digest("hex");
      hashes.push(contentHash);
      if (candidates.has(contentHash)) continue;
      const existing = await prisma.savedPhoto.findFirst({ where: { sellerUserId, contentHash }, orderBy: [{ createdAtUtc: "asc" }, { id: "asc" }], select: savedPhotoSelect });
      if (existing) { candidates.set(contentHash, {}); continue; }
      const metadata = await readPhotoMetadata(bytes, sources[index]);
      const asset = await storage.save({ body: bytes, contentType: file.type, fileName: file.name });
      staged.push(asset.key);
      candidates.set(contentHash, { data: { storageKey: asset.key, fileName: file.name.slice(0, 255), contentType: asset.contentType, sizeBytes: asset.sizeBytes, sellerUserId, contentHash, ...metadata } });
    }
    result = await prisma.$transaction(async (tx) => {
      // Sorted transaction locks prevent simultaneous uploads on two devices from
      // creating another copy. Historical duplicate records remain untouched.
      for (const hash of [...candidates.keys()].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sellerUserId + ":" + hash}, 0))`;
      }
      const saved = new Map<string, Saved & { alreadySaved: boolean }>();
      for (const [contentHash, candidate] of candidates) {
        const existing = await tx.savedPhoto.findFirst({ where: { sellerUserId, contentHash }, orderBy: [{ createdAtUtc: "asc" }, { id: "asc" }], select: savedPhotoSelect });
        if (existing) saved.set(contentHash, { ...existing, alreadySaved: true });
        else {
          if (!candidate.data) throw new Error("A matching photo was removed during this upload. Select the photo again to save it.");
          const created = await tx.savedPhoto.create({ data: candidate.data, select: savedPhotoSelect });
          usedKeys.add(candidate.data.storageKey);
          saved.set(contentHash, { ...created, alreadySaved: false });
        }
      }
      const seen = new Set<string>();
      return hashes.map((hash) => {
        const photo = saved.get(hash)!;
        const alreadySaved = photo.alreadySaved || seen.has(hash);
        seen.add(hash);
        return { ...photo, alreadySaved };
      });
    }, { timeout: 30_000 });
  } catch (error) {
    await Promise.allSettled(staged.map((key) => storage.remove(key)));
    throw error;
  }
  // Another request may have won the lock after our upload was staged.
  await Promise.allSettled(staged.filter((key) => !usedKeys.has(key)).map((key) => storage.remove(key)));
  return result;
}
