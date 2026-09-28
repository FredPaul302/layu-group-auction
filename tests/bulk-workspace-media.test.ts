import { describe, expect, it, vi } from "vitest";
import { loadBulkDescriptionFiles, savedPhotoMedia } from "../src/lib/catalog/bulk-workspace-media";

const saved = savedPhotoMedia({ id: "saved-1", fileName: "saved.jpg", contentType: "image/jpeg", sizeBytes: 5, createdAtUtc: "2026-09-21T14:00:00Z" });

describe("saved photos in bulk AI drafting", () => {
  it("loads only requested originals and keeps mixed local/saved photo order", async () => {
    const local = new File(["local"], "local.jpg", { type: "image/jpeg" });
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("saved"));
    const signal = new AbortController().signal;
    const files = await loadBulkDescriptionFiles([saved, { id: "local", file: local }], signal, send);
    expect(send).toHaveBeenCalledExactlyOnceWith("/api/admin/photos/saved-1", { signal });
    expect(files.map((file) => file.name)).toEqual(["saved.jpg", "local.jpg"]);
    expect(await files[0].text()).toBe("saved");
    expect(files[1]).toBe(local);
  });

  it("rejects missing photos and redirected sign-ins instead of treating HTML as a photo", async () => {
    for (const response of [new Response(null, { status: 404 }), Object.defineProperty(new Response("login"), "redirected", { value: true })]) {
      await expect(loadBulkDescriptionFiles([saved], new AbortController().signal, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow("Could not load saved.jpg");
    }
  });

  it("does not fetch originals after cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const send = vi.fn<typeof fetch>();
    await expect(loadBulkDescriptionFiles([saved], controller.signal, send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
