import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFilePhotoPreview, PhotoThumbnails, photoPreviewIssue } from "../src/components/admin/photo-thumbnails.js";
import { listingImageMaxSizeBytes } from "../src/lib/catalog/index.js";

afterEach(() => vi.restoreAllMocks());

describe("item photo previews", () => {
  it("labels saved images with their filename and a keyboard-accessible enlargement action", () => {
    const html = renderToStaticMarkup(<PhotoThumbnails label="Photos for radio" images={[
      { id: "front", src: "/uploads/front.jpg", filename: "front.jpg", alt: "Front of radio" }
    ]} />);
    expect(html).toContain('aria-label="Photos for radio"');
    expect(html).toContain('aria-label="Enlarge photo: front.jpg"');
    expect(html).toContain('type="button"');
    expect(html).toContain('alt="Front of radio"');
    expect(html).toContain('src="/uploads/front.jpg"');
    expect(html).toContain("front.jpg");
  });

  it("shows selected filenames immediately and safe placeholders for unsupported files", () => {
    const html = renderToStaticMarkup(<PhotoThumbnails files={[
      new File(["photo"], "front.jpg", { type: "image/jpeg" }),
      new File(["video"], "walkthrough.mp4", { type: "video/mp4" }),
      new File(["<svg/>"], "drawing.svg", { type: "image/svg+xml" })
    ]} />);
    expect(html).toContain("front.jpg");
    expect(html).toContain("walkthrough.mp4");
    expect(html).toContain("drawing.svg");
    expect(html).toContain("Videos are not supported");
    expect(html.match(/aria-label="Enlarge photo:/gu)).toHaveLength(1);
    expect(html).not.toContain("<video");
  });

  it("owns and releases each local image URL exactly once", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const file = new File(["photo"], "front.jpg", { type: "image/jpeg" });
    const thumbnail = createFilePhotoPreview(file);
    const enlarged = createFilePhotoPreview(file);
    expect(create).toHaveBeenCalledTimes(2);
    expect(thumbnail?.src).toBe("blob:first");
    expect(enlarged?.src).toBe("blob:second");
    thumbnail?.dispose();
    thumbnail?.dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenLastCalledWith("blob:first");
    enlarged?.dispose();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenLastCalledWith("blob:second");
  });

  it("does not allocate image URLs for videos, empty files, or oversized uploads", () => {
    const create = vi.spyOn(URL, "createObjectURL");
    expect(createFilePhotoPreview(new File(["video"], "video.mp4", { type: "video/mp4" }))).toBeNull();
    expect(createFilePhotoPreview(new File([], "empty.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(photoPreviewIssue({ type: "image/jpeg", size: listingImageMaxSizeBytes + 1 })).toContain("too large");
    expect(photoPreviewIssue({ type: "image/jpeg", size: listingImageMaxSizeBytes })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not render active or embedded content as saved image sources", () => {
    const html = renderToStaticMarkup(<PhotoThumbnails images={[
      { id: "bad", src: "javascript:alert(1)", filename: "bad.svg" }
    ]} />);
    expect(html).toContain("This saved image cannot be previewed");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
  });
});
