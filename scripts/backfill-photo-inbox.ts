import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { getStorageAdapter } from "../src/lib/storage";
import { readPhotoMetadata } from "../src/lib/catalog/photo-metadata";

async function main() {
  const flag = process.argv.indexOf("--time-zone");
  const timeZone = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (flag >= 0 && !timeZone) throw new Error("Supply an IANA time zone after --time-zone.");
  if (timeZone) new Intl.DateTimeFormat("en-US", { timeZone }).format();
  const storage = getStorageAdapter();
  const counts = { processed: 0, captured: 0, uploadedDateFallback: 0, failed: 0 };
  let cursor: string | undefined;
  while (true) {
    const photos = await prisma.savedPhoto.findMany({ where: { metadataVersion: null }, orderBy: { id: "asc" }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!photos.length) break;
    for (const photo of photos) {
      cursor = photo.id;
      try {
        const asset = await storage.read(photo.storageKey);
        const contentHash = createHash("sha256").update(asset.body).digest("hex");
        const metadata = await readPhotoMetadata(asset.body, { timeZone });
        await prisma.savedPhoto.update({ where: { id: photo.id }, data: { contentHash, ...metadata } });
        counts.processed++;
        if (metadata.capturedAtUtc) counts.captured++; else counts.uploadedDateFallback++;
      } catch { counts.failed++; console.error(JSON.stringify({ photoInboxBackfill: "unreadable photo", id: photo.id })); }
    }
  }
  console.log(JSON.stringify({ photoInboxBackfill: counts }));
  if (counts.failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Photo metadata backfill failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
