import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), create: vi.fn(), findFirst: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { savedPhoto: { create: mocks.create, findFirst: mocks.findFirst }, $transaction: mocks.transaction } }));
vi.mock("@/lib/storage", () => ({ getStorageAdapter: () => ({ save: mocks.save, remove: mocks.remove }) }));
import { saveInboxPhotos, validateInboxPhotos } from "../src/lib/catalog/photo-inbox";
import { listingImageMaxSizeBytes } from "../src/lib/catalog";
import { validateInboxTransfer } from "../src/lib/catalog/photo-inbox-validation";
const photo = () => new File(["photo"], "phone.jpg", { type: "image/jpeg" });
beforeEach(() => { vi.resetAllMocks(); mocks.remove.mockResolvedValue(undefined); mocks.findFirst.mockResolvedValue(null); mocks.transaction.mockImplementation((work) => work({ savedPhoto: { create: mocks.create, findFirst: mocks.findFirst }, $executeRaw: mocks.lock })); });
describe("photo inbox", () => {
  it("saves unassigned photos without creating a listing", async () => {
    mocks.save.mockResolvedValue({ key: "private.jpg", contentType: "image/jpeg", sizeBytes: 5 });
    mocks.create.mockResolvedValue({ id: "saved-one" });
    expect(await saveInboxPhotos("seller-one", [photo()])).toEqual([{ id: "saved-one", alreadySaved: false }]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sellerUserId: "seller-one", storageKey: "private.jpg", fileName: "phone.jpg", contentType: "image/jpeg", sizeBytes: 5, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/), metadataVersion: 1 }) }));
  });
  it("cleans uploaded objects when saving metadata fails", async () => {
    mocks.save.mockResolvedValue({ key: "private.jpg", contentType: "image/jpeg", sizeBytes: 5 });
    mocks.transaction.mockRejectedValue(new Error("database unavailable"));
    await expect(saveInboxPhotos("seller", [photo()])).rejects.toThrow("database unavailable");
    expect(mocks.remove).toHaveBeenCalledWith("private.jpg");
  });
  it("cleans earlier objects when a later upload fails", async () => {
    mocks.save.mockResolvedValueOnce({ key: "first.jpg", contentType: "image/jpeg", sizeBytes: 5 }).mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(saveInboxPhotos("seller", [photo(), new File(["another"], "second.jpg", { type: "image/jpeg" })])).rejects.toThrow("storage unavailable");
    expect(mocks.remove).toHaveBeenCalledWith("first.jpg"); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("reuses an identical saved file even when renamed, scoped to its owner", async () => {
    mocks.findFirst.mockResolvedValue({ id: "original" });
    expect(await saveInboxPhotos("seller", [photo()])).toEqual([{ id: "original", alreadySaved: true }]);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerUserId: "seller", contentHash: expect.any(String) } }));
    expect(mocks.lock).toHaveBeenCalledOnce();
  });
  it("stores only one copy of repeated bytes within a batch", async () => {
    mocks.save.mockResolvedValue({ key: "one", contentType: "image/jpeg", sizeBytes: 5 }); mocks.create.mockResolvedValue({ id: "one" });
    const result = await saveInboxPhotos("seller", [photo(), new File(["photo"], "renamed.jpg", { type: "image/jpeg" })]);
    expect(result).toEqual([{ id: "one", alreadySaved: false }, { id: "one", alreadySaved: true }]);
    expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("rechecks under the transaction lock and cleans the losing concurrent upload", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "other-device" });
    mocks.save.mockResolvedValue({ key: "staged", contentType: "image/jpeg", sizeBytes: 5 });
    expect(await saveInboxPhotos("seller", [photo()])).toEqual([{ id: "other-device", alreadySaved: true }]);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledWith("staged");
  });
  it.each([[], [new File([], "empty.jpg", { type: "image/jpeg" })], [new File(["x"], "active.svg", { type: "image/svg+xml" })], Array.from({ length: 101 }, photo)].map((files) => ({ files })))("rejects invalid photos before storage", async ({ files }) => {
    await expect(saveInboxPhotos("seller", files)).rejects.toBeInstanceOf(Error); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects oversized photos and oversized batches", () => {
    const oversized = { name: "large.jpg", size: listingImageMaxSizeBytes + 1, type: "image/jpeg" };
    expect(() => validateInboxPhotos([oversized])).toThrow("20 MB");
    const maxSize = { ...oversized, size: listingImageMaxSizeBytes };
    expect(() => validateInboxPhotos([maxSize])).not.toThrow();
    expect(() => validateInboxPhotos(Array(13).fill(maxSize))).toThrow("256 MB");
  });
  it("accepts ten 2.3 MB photos and a selection larger than the former 128 MB limit", () => {
    const files = Array.from({ length: 10 }, (_, i) => new File([new Uint8Array(2_300_000)], `phone-${i}.jpg`, { type: "image/jpeg" }));
    expect(() => validateInboxPhotos(files)).not.toThrow();
    expect(() => validateInboxPhotos(Array(8).fill({ name: "large.jpg", type: "image/jpeg", size: listingImageMaxSizeBytes }))).not.toThrow();
  });
  it("identifies an empty original without calling it oversized", () => {
    expect(() => validateInboxPhotos([new File([], "cloud.jpg", { type: "image/jpeg" })])).toThrow("“cloud.jpg” (0 bytes) is empty or could not be read");
  });
  it("detects truncated uploads using the original byte count before saving", () => {
    expect(() => validateInboxTransfer([photo()], JSON.stringify([{ name: "phone.jpg", size: 2_300_000 }]))).toThrow("did not arrive intact");
    expect(() => validateInboxTransfer([photo()], JSON.stringify([{ name: "phone.jpg", size: 5 }]))).not.toThrow();
    expect(() => validateInboxTransfer([photo()], "invalid")).toThrow("Photo details could not be read");
    expect(() => validateInboxTransfer([photo()], "[]")).toThrow("Photo details could not be read");
  });
});
