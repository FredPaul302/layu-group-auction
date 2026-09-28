import { describe, expect, it, vi } from "vitest";
import { checkInboxPhotos, uploadInboxPhoto } from "../src/lib/catalog/upload-inbox-photo";
import { createHash } from "node:crypto";

const photo = () => new File([new Uint8Array(2_300_000)], "phone.jpg", { type: "image/jpeg" });
const success = () => Response.json({ photos: [{ id: "saved", fileName: "phone.jpg", sizeBytes: 2_300_000, contentType: "image/jpeg", createdAtUtc: new Date().toISOString() }] });

describe("individual photo inbox uploads", () => {
  it("reads original bytes and sends one photo with its expected size", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(success());
    expect((await uploadInboxPhoto(photo(), send)).id).toBe("saved");
    const data = send.mock.calls[0][1]?.body as FormData;
    const uploaded = data.get("photos") as File;
    expect(uploaded.size).toBe(2_300_000);
    expect(uploaded.name).toBe("phone.jpg");
    expect(JSON.parse(data.get("photoManifest") as string)).toEqual([{ name: "phone.jpg", size: 2_300_000, lastModified: expect.any(Number) }]);
    expect(data.get("sourceTimeZone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
  it("identifies a cloud original that is unreadable before starting a request", async () => {
    const file = photo(); vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("NotReadableError"));
    const send = vi.fn<typeof fetch>();
    await expect(uploadInboxPhoto(file, send)).rejects.toThrow("Download the original photo");
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects missing source bytes before starting a request", async () => {
    const file = photo(); vi.spyOn(file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(0));
    const send = vi.fn<typeof fetch>();
    await expect(uploadInboxPhoto(file, send)).rejects.toThrow("could not be read completely");
    expect(send).not.toHaveBeenCalled();
  });
  it("gives a useful error for non-JSON proxy rejection", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("<h1>Too large</h1>", { status: 413 }));
    await expect(uploadInboxPhoto(photo(), send)).rejects.toThrow("server rejected “phone.jpg” as too large");
  });
  it("does not retry an uncertain save automatically", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection reset"));
    await expect(uploadInboxPhoto(photo(), send)).rejects.toThrow("check whether it arrived before retrying");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not report success without complete save confirmation", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ photos: [{ id: "saved", sizeBytes: 0 }] }));
    await expect(uploadInboxPhoto(photo(), send)).rejects.toThrow("did not confirm a complete save");
  });
});

describe("duplicate checks before transfer", () => {
  const file = (body: string, name = "phone.jpg") => new File([body], name, { type: "image/jpeg" });
  it("sends only fingerprints, skips renamed and repeated files, and leaves new photos ready", async () => {
    const hash = createHash("sha256").update("existing").digest("hex");
    const existing = { id: "saved", contentHash: hash, fileName: "original.jpg" };
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ photos: [existing] }));
    const result = await checkInboxPhotos([file("existing", "renamed.jpg"), file("new"), file("new", "copy.jpg"), file("different")], send);
    expect(result.map((entry) => entry.status)).toEqual(["duplicate", "ready", "duplicate", "ready"]);
    expect(result[0].existing).toEqual(existing);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBe("/api/admin/photos/check");
    const body = JSON.parse(send.mock.calls[0][1]!.body as string);
    expect(Object.keys(body)).toEqual(["hashes"]); expect(body.hashes).toHaveLength(3);
  });
  it("keeps an unreadable cloud file separate from valid new photos", async () => {
    const bad = file("bad"); vi.spyOn(bad, "arrayBuffer").mockRejectedValue(new Error("unreadable"));
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ photos: [] }));
    const result = await checkInboxPhotos([bad, file("good")], send);
    expect(result.map((entry) => entry.status)).toEqual(["failed", "ready"]);
    expect(result[0].error).toContain("Download the original");
  });
  it("does not authorize uploads when the duplicate check fails", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(checkInboxPhotos([file("new")], send)).rejects.toThrow("No photos were uploaded");
    expect(send).toHaveBeenCalledOnce();
  });
});
