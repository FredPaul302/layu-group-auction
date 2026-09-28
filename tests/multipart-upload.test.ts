import { describe, expect, it } from "vitest";
import { readMultipartUpload } from "../src/lib/storage/multipart-upload";

const limits = { bodyBytes: 32 * 1024 * 1024, fileBytes: 20 * 1024 * 1024, files: 100 };
function request(data: FormData) { return new Request("http://localhost/upload", { method: "POST", body: data }); }

describe("bounded multipart upload reader", () => {
  it("preserves ten phone-sized files and field order without a Content-Length header", async () => {
    const data = new FormData(); data.set("photoManifest", "original metadata");
    for (let index = 0; index < 10; index++) data.append("photos", new File([new Uint8Array(2_300_000).fill(index)], `phone-${index}.jpg`, { type: "image/jpeg" }));
    const upload = await readMultipartUpload(request(data), limits);
    try {
      expect(upload.formData.get("photoManifest")).toBe("original metadata");
      const files = upload.formData.getAll("photos") as File[];
      expect(files).toHaveLength(10);
      for (let index = 0; index < files.length; index++) {
        expect(files[index].name).toBe(`phone-${index}.jpg`);
        expect(files[index].size).toBe(2_300_000);
        expect(new Uint8Array(await files[index].arrayBuffer())[1_000_000]).toBe(index);
      }
    } finally { await upload.cleanup(); }
    await expect((upload.formData.get("photos") as File).arrayBuffer()).rejects.toThrow();
  });
  it("enforces the byte limit while streaming even without a declared length", async () => {
    const data = new FormData(); data.append("photos", new File([new Uint8Array(2000)], "large.jpg", { type: "image/jpeg" }));
    await expect(readMultipartUpload(request(data), { ...limits, bodyBytes: 1000 })).rejects.toMatchObject({ code: "upload_too_large", status: 413 });
  });
  it("rejects oversized files and excess files instead of silently truncating them", async () => {
    const data = new FormData(); data.append("photos", new File([new Uint8Array(2000)], "large.jpg", { type: "image/jpeg" }));
    await expect(readMultipartUpload(request(data), { ...limits, fileBytes: 1000 })).rejects.toMatchObject({ code: "upload_file_too_large", status: 413 });
    data.append("photos", new File(["photo"], "second.jpg", { type: "image/jpeg" }));
    await expect(readMultipartUpload(request(data), { ...limits, files: 1 })).rejects.toMatchObject({ code: "upload_too_many_parts", status: 413 });
  });
  it("rejects truncated multipart input after a file has started", async () => {
    const data = new FormData(); data.append("photos", new File([new Uint8Array(2000)], "photo.jpg", { type: "image/jpeg" }));
    const full = request(data); const bytes = new Uint8Array(await full.arrayBuffer());
    const partial = new Request(full.url, { method: "POST", headers: full.headers, body: bytes.slice(0, -200) });
    await expect(readMultipartUpload(partial, limits)).rejects.toMatchObject({ code: "upload_incomplete" });
  });
});
