import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  descriptionPhotoMaxBytes, descriptionPhotoMaxSourceBytes,
  getDescriptionPhotoDimensions, validateDescriptionSourcePhoto
} from "../src/lib/catalog/description-photos";
import { prepareDescriptionPhotos } from "../src/lib/catalog/prepare-description-photos";

function sourceFile(name = "item.jpg") { return new File(["original photo bytes"], name, { type: "image/jpeg", lastModified: 1234 }); }

describe("photo analysis preparation limits", () => {
  it("preserves aspect ratio, handles portrait photos, and does not enlarge small images", () => {
    expect(getDescriptionPhotoDimensions(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(getDescriptionPhotoDimensions(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(getDescriptionPhotoDimensions(320, 240)).toEqual({ width: 320, height: 240 });
  });
  it.each([[0, 50], [20, -1], [Infinity, 50], [50.5, 25], [10000, 10000]])("rejects unsafe image dimensions %s×%s", (width, height) => {
    expect(() => getDescriptionPhotoDimensions(width, height)).toThrow();
  });
  it.each([
    { type: "image/heic", size: 1000 }, { type: "image/svg+xml", size: 1000 },
    { type: "video/mp4", size: 1000 }, { type: "image/jpeg", size: 0 },
    { type: "image/png", size: descriptionPhotoMaxSourceBytes + 1 }
  ])("rejects unsupported or excessive source files before decoding", (file) => {
    expect(() => validateDescriptionSourcePhoto(file)).toThrow();
  });
});

describe("browser photo preparation", () => {
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
  let decoder: ReturnType<typeof vi.fn>;
  let draw: ReturnType<typeof vi.fn>;
  let encode: ReturnType<typeof vi.fn>;
  let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toBlob: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bitmap = { width: 4000, height: 3000, close: vi.fn() };
    decoder = vi.fn().mockResolvedValue(bitmap);
    draw = vi.fn();
    encode = vi.fn((callback: (blob: Blob) => void) => callback(new Blob(["jpeg-copy"], { type: "image/jpeg" })));
    canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ fillRect: vi.fn(), drawImage: draw })), toBlob: encode };
    vi.stubGlobal("createImageBitmap", decoder);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload?: () => void;
      onabort?: () => void;
      readAsDataURL() { this.result = "data:image/jpeg;base64,Y29weQ=="; queueMicrotask(() => this.onload?.()); }
      abort() { this.onabort?.(); }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("makes bounded JPEG analysis copies, closes decoded images, and leaves original files intact", async () => {
    const file = sourceFile();
    const result = await prepareDescriptionPhotos([file]);
    expect(result).toEqual(["data:image/jpeg;base64,Y29weQ=="]);
    expect(decoder).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 768);
    expect(encode).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(await file.text()).toBe("original photo bytes");
  });
  it("analyzes only the first three selected images", async () => {
    const files = Array.from({ length: 5 }, (_, i) => sourceFile(`${i}.jpg`));
    expect(await prepareDescriptionPhotos(files)).toHaveLength(3);
    expect(decoder.mock.calls.map(([file]) => file)).toEqual(files.slice(0, 3));
  });
  it("lowers JPEG quality when the first encoding exceeds the byte limit", async () => {
    encode.mockImplementationOnce((callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array(descriptionPhotoMaxBytes + 1)], { type: "image/jpeg" })));
    await prepareDescriptionPhotos([sourceFile()]);
    expect(encode.mock.calls.map((args) => args[2])).toEqual([0.8, 0.65]);
  });
  it("bounds repeated encoding attempts and frees images on failure", async () => {
    encode.mockImplementation((callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array(descriptionPhotoMaxBytes + 1)], { type: "image/jpeg" })));
    await expect(prepareDescriptionPhotos([sourceFile()])).rejects.toThrow(/size limit/u);
    expect(encode).toHaveBeenCalledTimes(16);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("stops before processing any files when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareDescriptionPhotos([sourceFile()], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(decoder).not.toHaveBeenCalled();
  });
  it("releases an image when cancellation occurs while decoding, without proceeding to the next photo", async () => {
    const controller = new AbortController();
    decoder.mockImplementation(async () => { controller.abort(); return bitmap; });
    await expect(prepareDescriptionPhotos([sourceFile(), sourceFile("second.jpg")], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(encode).not.toHaveBeenCalled();
    expect(decoder).toHaveBeenCalledOnce();
  });
  it("rejects an empty selection without decoding or encoding", async () => {
    await expect(prepareDescriptionPhotos([])).rejects.toThrow(/at least one/u);
    expect(decoder).not.toHaveBeenCalled();
  });
});
