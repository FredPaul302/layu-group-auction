import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = { $executeRaw: vi.fn(), bulkWorkspace: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), delete: vi.fn() }, savedPhoto: { findMany: vi.fn() }, bulkWorkspaceAsset: { findMany: vi.fn() }, bulkWorkspacePhoto: { deleteMany: vi.fn(), createMany: vi.fn() } };
  return { tx, transaction: vi.fn(), save: vi.fn(), remove: vi.fn() };
});
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/storage", () => ({ getStorageAdapter: () => ({ save: mocks.save, remove: mocks.remove }) }));
import { saveBulkWorkspace, deleteBulkWorkspace } from "../src/lib/catalog/bulk-workspace-service";
const input = () => ({ name: "100 lots", version: 0, snapshot: { items: [{ clientId: "one", sku: "", title: "", description: "", categorySlug: "", listingType: "auction", imageFileIds: [], videoFileIds: [] }], media: [], sharedClosing: true, sharedEndAtUtc: "", duration: "10", durationUnit: "days", editingInstructions: {}, descriptionDrafts: {}, includePriceSuggestion: true, saveAs: "draft" } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.tx.bulkWorkspace.findUnique.mockResolvedValue(null);
  mocks.tx.bulkWorkspace.create.mockImplementation(async (args) => args.data);
  mocks.tx.bulkWorkspace.update.mockImplementation(async (args) => args.data);
});
describe("saved batch ownership and version rules", () => {
  it("saves incomplete work without applying publication validation", async () => {
    const result = await saveBulkWorkspace("owner", "batch-123456789", input());
    expect(result).toMatchObject({ sellerUserId: "owner", version: 1, name: "100 lots" });
    expect(mocks.tx.$executeRaw).toHaveBeenCalled(); expect(mocks.tx.bulkWorkspacePhoto.deleteMany).toHaveBeenCalled();
  });
  it("does not overwrite a batch owned by another admin", async () => {
    mocks.tx.bulkWorkspace.findUnique.mockResolvedValue({ sellerUserId: "other", version: 1, listingIds: [] });
    await expect(saveBulkWorkspace("owner", "batch-123456789", { ...input(), version: 1 })).rejects.toMatchObject({ status: 404 });
    expect(mocks.tx.bulkWorkspace.update).not.toHaveBeenCalled();
  });
  it("rejects a stale tab and preserves the newer saved version", async () => {
    mocks.tx.bulkWorkspace.findUnique.mockResolvedValue({ sellerUserId: "owner", version: 2, listingIds: [] });
    await expect(saveBulkWorkspace("owner", "batch-123456789", { ...input(), version: 1 })).rejects.toMatchObject({ status: 409 });
    expect(mocks.tx.bulkWorkspace.update).not.toHaveBeenCalled();
  });
  it("cannot turn a completed batch back into an unsubmitted draft", async () => {
    mocks.tx.bulkWorkspace.findUnique.mockResolvedValue({ sellerUserId: "owner", version: 2, listingIds: ["listing"] });
    await expect(saveBulkWorkspace("owner", "batch-123456789", { ...input(), version: 2 })).rejects.toMatchObject({ status: 409 });
    expect(mocks.tx.bulkWorkspace.update).not.toHaveBeenCalled();
  });
  it("rejects another account's photo reference before committing", async () => {
    const value = input(); Object.assign(value.snapshot, { media: [{ id: "photo", savedPhotoId: "foreign", file: { name: "x.jpg", type: "image/jpeg", size: 1, lastModified: 0 } }] });
    mocks.tx.savedPhoto.findMany.mockResolvedValue([]);
    await expect(saveBulkWorkspace("owner", "batch-123456789", value)).rejects.toMatchObject({ status: 422 });
    expect(mocks.tx.savedPhoto.findMany.mock.calls[0][0].where.sellerUserId).toBe("owner"); expect(mocks.tx.bulkWorkspace.create).not.toHaveBeenCalled();
  });
  it("protects photos used by unfinished work and trusts stored sizes", async () => {
    const value = input(); Object.assign(value.snapshot, { media: [{ id: "photo", savedPhotoId: "owned", file: { name: "fake.jpg", type: "image/jpeg", size: 1, lastModified: 0 } }] });
    mocks.tx.savedPhoto.findMany.mockResolvedValue([{ id: "owned", fileName: "real.jpg", contentType: "image/jpeg", sizeBytes: 2048 }]);
    await saveBulkWorkspace("owner", "batch-123456789", value);
    expect(mocks.tx.bulkWorkspace.create.mock.calls[0][0].data.snapshot.media[0].file.size).toBe(2048);
    expect(mocks.tx.bulkWorkspacePhoto.createMany).toHaveBeenCalledWith({ data: [{ workspaceId: "batch-123456789", photoId: "owned" }] });
  });
  it("checks the version before deleting and only removes workspace-owned assets", async () => {
    mocks.tx.bulkWorkspace.findFirst.mockResolvedValue({ version: 3, assets: [{ storageKey: "private-draft" }] });
    await expect(deleteBulkWorkspace("owner", "batch-123456789", 2)).rejects.toMatchObject({ status: 409 });
    expect(mocks.tx.bulkWorkspace.delete).not.toHaveBeenCalled();
    await deleteBulkWorkspace("owner", "batch-123456789", 3);
    expect(mocks.remove).toHaveBeenCalledWith("private-draft"); expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
