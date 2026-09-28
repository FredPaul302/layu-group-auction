import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), batch: vi.fn(), save: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: mocks.user }));
vi.mock("@/lib/catalog/batch-operations", async (original) => ({ ...await original<object>(), manageListingBatch: mocks.batch }));
vi.mock("@/lib/catalog/photo-inbox", () => ({ saveInboxPhotos: mocks.save }));
vi.mock("@/lib/prisma", () => ({ prisma: { savedPhoto: { findMany: mocks.findMany, findFirst: mocks.findFirst, deleteMany: mocks.deleteMany } } }));
vi.mock("@/lib/storage", () => ({ getStorageAdapter: () => ({ read: mocks.read, remove: mocks.remove }) }));
import { POST as batch } from "../src/app/api/admin/listings/batch/route";
import { GET as listPhotos, POST as upload } from "../src/app/api/admin/photos/route";
import { GET as getPhoto, DELETE as deletePhoto } from "../src/app/api/admin/photos/[photoId]/route";
import { POST as checkPhotos } from "../src/app/api/admin/photos/check/route";
import { savedPhotoSelect } from "../src/lib/catalog/photo-inbox-select";
const context = { params: Promise.resolve({ photoId: "photo" }) };
function request(path: string, method = "GET", body?: BodyInit, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers: { Origin: origin }, body });
}
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "admin", role: "admin", emailVerifiedAtUtc: new Date() }); });
describe("market admin batch and inbox routes", () => {
  it("requires admin access for publishing, listing inbox, and photo reads", async () => {
    mocks.user.mockResolvedValue({ id: "buyer", role: "bidder" });
    expect((await batch(request("/api/admin/listings/batch", "POST", JSON.stringify({ ids: ["one"], action: "publish" })))).status).toBe(303);
    expect((await listPhotos(request("/api/admin/photos"))).status).toBe(303);
    expect((await getPhoto(request("/api/admin/photos/photo"), context)).status).toBe(303);
    expect(mocks.batch).not.toHaveBeenCalled(); expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutations before accessing records or storage", async () => {
    expect((await batch(request("/api/admin/listings/batch", "POST", "{}", "https://other.test"))).status).toBe(403);
    expect((await upload(request("/api/admin/photos", "POST", new FormData(), "https://other.test"))).status).toBe(403);
    expect((await deletePhoto(request("/api/admin/photos/photo", "DELETE", undefined, "https://other.test"), context)).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("publishes the explicit selection as the signed-in seller", async () => {
    mocks.batch.mockResolvedValue({ count: 2 });
    const response = await batch(request("/api/admin/listings/batch", "POST", JSON.stringify({ ids: ["one", "two"], action: "publish" })));
    expect(response.status).toBe(200); expect(mocks.batch).toHaveBeenCalledWith({ ids: ["one", "two"], action: "publish", sellerUserId: "admin" });
  });
  it("lists only the current seller's saved photos without storage keys", async () => {
    mocks.findMany.mockResolvedValue([]); await listPhotos(request("/api/admin/photos"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerUserId: "admin" }, select: savedPhotoSelect }));
  });
  it("saves photos without item assignments", async () => {
    mocks.save.mockResolvedValue([{ id: "saved" }]); const data = new FormData(); data.set("photos", new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    expect((await upload(request("/api/admin/photos", "POST", data))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("admin", [expect.any(File)], [{ lastModified: undefined, timeZone: undefined }]);
  });
  it("reports a damaged transfer separately from an oversized photo", async () => {
    const data = new FormData(); data.set("photos", new File([], "phone.jpg", { type: "image/jpeg" }));
    data.set("photoManifest", JSON.stringify([{ name: "phone.jpg", size: 2_300_000 }]));
    const response = await upload(request("/api/admin/photos", "POST", data));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "photo_transfer_incomplete", message: expect.stringContaining("received 0 bytes") }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not save an unreadable multipart upload", async () => {
    const response = await upload(new NextRequest("http://localhost:3000/api/admin/photos", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "multipart/form-data; boundary=missing" }, body: "truncated" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "photo_transfer_incomplete" }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects request bodies over the batch limit before reading files", async () => {
    const input = request("/api/admin/photos", "POST", new FormData());
    input.headers.set("content-length", String(258 * 1024 * 1024));
    const response = await upload(input);
    expect(response.status).toBe(413); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("denies another seller's photo and does not touch its object", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await getPhoto(request("/api/admin/photos/photo"), context)).status).toBe(404);
    expect((await deletePhoto(request("/api/admin/photos/photo", "DELETE"), context)).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "photo", sellerUserId: "admin" } });
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("serves an owned inbox photo with private caching", async () => {
    mocks.findFirst.mockResolvedValue({ id: "photo", storageKey: "private.jpg" }); mocks.read.mockResolvedValue({ body: Buffer.from("x"), contentType: "image/jpeg" });
    const response = await getPhoto(request("/api/admin/photos/photo"), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("private");
  });
  it("checks only the current seller's fingerprints and returns no storage keys", async () => {
    mocks.findMany.mockResolvedValue([]); const hash = "a".repeat(64);
    const response = await checkPhotos(request("/api/admin/photos/check", "POST", JSON.stringify({ hashes: [hash, hash] })));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerUserId: "admin", contentHash: { in: [hash] } }, select: savedPhotoSelect }));
    expect(savedPhotoSelect).not.toHaveProperty("storageKey");
  });
  it("protects duplicate checks with same-origin and admin authentication", async () => {
    expect((await checkPhotos(request("/api/admin/photos/check", "POST", "{}", "https://other.test"))).status).toBe(403);
    mocks.user.mockResolvedValue({ id: "buyer", role: "bidder" });
    expect((await checkPhotos(request("/api/admin/photos/check", "POST", "{}"))).status).toBe(303);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it.each(["null", "invalid", "{}", JSON.stringify({ hashes: ["not-a-hash"] }), JSON.stringify({ hashes: Array(101).fill("a".repeat(64)) })])("rejects invalid fingerprint inputs: %s", async (body) => {
    expect((await checkPhotos(request("/api/admin/photos/check", "POST", body))).status).toBe(422);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("bounds the duplicate-check body without relying on Content-Length", async () => {
    expect((await checkPhotos(request("/api/admin/photos/check", "POST", " ".repeat(16385)))).status).toBe(413);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
