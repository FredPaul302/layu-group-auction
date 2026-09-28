import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { listingImageMaxSizeBytes } from "./index";
import { bulkListingMaxWorkspaceSizeBytes, bulkListingVideoMaxSizeBytes, getBulkListingMediaKind } from "./bulk-listings";
import { parseWorkspaceSnapshot, WorkspaceDraftError } from "./bulk-workspace-draft";

export const workspaceSummarySelect = { id: true, name: true, version: true, updatedAtUtc: true, listingIds: true } as const;
export const workspaceSelect = { ...workspaceSummarySelect, snapshot: true } as const;
export async function lockWorkspace(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"bulk-workspace:" + id}, 0))`;
}

export async function saveBulkWorkspace(sellerUserId: string, id: string, input: { version: number; name: string; snapshot: unknown }) {
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(id) || !Number.isSafeInteger(input.version) || input.version < 0 || typeof input.name !== "string" || input.name.length > 160) throw new WorkspaceDraftError("Invalid saved batch details.");
  const snapshot = parseWorkspaceSnapshot(input.snapshot);
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, id);
    const existing = await tx.bulkWorkspace.findUnique({ where: { id } });
    if (existing && existing.sellerUserId !== sellerUserId) throw new WorkspaceDraftError("Saved batch not found.", 404);
    if ((existing?.version ?? 0) !== input.version) throw new WorkspaceDraftError("This batch changed in another tab or device. Keep this tab open to preserve your edits, or use Resume batch to open the latest saved version.", 409);
    if (existing?.listingIds.length) throw new WorkspaceDraftError("This batch has already created listings. Open those listings or start a new batch.", 409);
    const photoIds = [...new Set(snapshot.media.flatMap((m) => m.savedPhotoId ? [m.savedPhotoId] : []))];
    const assetIds = [...new Set(snapshot.media.flatMap((m) => m.savedAssetId ? [m.savedAssetId] : []))];
    const photos = photoIds.length ? await tx.savedPhoto.findMany({ where: { sellerUserId, id: { in: photoIds } } }) : [];
    const assets = assetIds.length ? await tx.bulkWorkspaceAsset.findMany({ where: { workspaceId: id, id: { in: assetIds } } }) : [];
    if (photos.length !== photoIds.length || assets.length !== assetIds.length) throw new WorkspaceDraftError("A selected photo or video is missing. Remove it or select it again before saving.");
    const stored = new Map([...photos, ...assets].map((asset) => [asset.id, asset]));
    for (const entry of snapshot.media) {
      const asset = stored.get(entry.savedPhotoId ?? entry.savedAssetId ?? "");
      if (asset) entry.file = { name: asset.fileName, type: asset.contentType, size: asset.sizeBytes, lastModified: entry.file.lastModified };
    }
    if (snapshot.media.reduce((sum, m) => sum + m.file.size, 0) > bulkListingMaxWorkspaceSizeBytes) throw new WorkspaceDraftError("Saved batches support up to 1 GB of media.");
    const data = { name: input.name.trim() || "Untitled batch", version: input.version + 1, snapshot: snapshot as unknown as Prisma.InputJsonValue };
    const saved = existing ? await tx.bulkWorkspace.update({ where: { id }, data, select: workspaceSelect })
      : await tx.bulkWorkspace.create({ data: { id, sellerUserId, ...data }, select: workspaceSelect });
    await tx.bulkWorkspacePhoto.deleteMany({ where: { workspaceId: id } });
    if (photoIds.length) await tx.bulkWorkspacePhoto.createMany({ data: photoIds.map((photoId) => ({ workspaceId: id, photoId })) });
    return saved;
  });
}

export async function deleteBulkWorkspace(sellerUserId: string, id: string, version: number) {
  const assets = await prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, id);
    const workspace = await tx.bulkWorkspace.findFirst({ where: { id, sellerUserId }, include: { assets: true } });
    if (!workspace) throw new WorkspaceDraftError("Saved batch not found.", 404);
    if (workspace.version !== version) throw new WorkspaceDraftError("This batch changed since you opened it. Refresh saved batches before deleting.", 409);
    await tx.bulkWorkspace.delete({ where: { id } });
    return workspace.assets;
  });
  await Promise.allSettled(assets.map((asset) => getStorageAdapter().remove(asset.storageKey)));
}

export async function saveWorkspaceAsset(sellerUserId: string, workspaceId: string, clientId: string, file: File) {
  const kind = getBulkListingMediaKind({ name: file.name, type: file.type });
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(clientId) || !kind || file.size <= 0 || file.size > (kind === "image" ? listingImageMaxSizeBytes : bulkListingVideoMaxSizeBytes)) throw new WorkspaceDraftError("Choose a non-empty photo up to 20 MB or a video up to 50 MB.");
  const workspace = await prisma.bulkWorkspace.findFirst({ where: { id: workspaceId, sellerUserId } });
  if (!workspace || workspace.listingIds.length) throw new WorkspaceDraftError("This batch is unavailable for editing.", 409);
  const existing = await prisma.bulkWorkspaceAsset.findUnique({ where: { workspaceId_clientId: { workspaceId, clientId } } });
  if (existing) return existing;
  const storage = getStorageAdapter();
  const asset = await storage.save({ fileName: file.name, contentType: file.type, body: Buffer.from(await file.arrayBuffer()) });
  let used = false;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      const current = await tx.bulkWorkspace.findFirst({ where: { id: workspaceId, sellerUserId } });
      if (!current || current.listingIds.length) throw new WorkspaceDraftError("This batch is unavailable for editing.", 409);
      const duplicate = await tx.bulkWorkspaceAsset.findUnique({ where: { workspaceId_clientId: { workspaceId, clientId } } });
      if (duplicate) return duplicate;
      const totals = await tx.bulkWorkspaceAsset.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true }, _count: true });
      if (totals._count >= 900 || (totals._sum.sizeBytes ?? 0) + file.size > bulkListingMaxWorkspaceSizeBytes) throw new WorkspaceDraftError("This saved batch has reached its 1 GB media limit. Start another saved batch.");
      const result = await tx.bulkWorkspaceAsset.create({ data: { workspaceId, clientId, storageKey: asset.key, fileName: file.name.slice(0, 255), contentType: file.type, sizeBytes: file.size } });
      used = true;
      return result;
    });
  } finally { if (!used) await storage.remove(asset.key).catch(() => {}); }
}
