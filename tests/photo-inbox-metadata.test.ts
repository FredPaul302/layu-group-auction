import { describe, expect, it } from "vitest";
import { cameraDateToUtc, readPhotoMetadata } from "../src/lib/catalog/photo-metadata";
import { photoDateLabel, sortInboxPhotos, type SavedInboxPhoto } from "../src/lib/catalog/photo-inbox-presentation";

// Minimal JPEG with an EXIF sub-IFD containing the original camera date and UTC offset.
function cameraJpeg(date: string, offset?: string) {
  const fields = [[0x9003, date], ...(offset ? [[0x9011, offset]] : [])] as [number, string][];
  const start = 26 + 2 + fields.length * 12 + 4;
  const tiff = Buffer.alloc(start + fields.reduce((size, [, text]) => size + text.length + 1, 0));
  tiff.write("II"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(fields.length, 26); let position = start;
  fields.forEach(([tag, text], i) => {
    const at = 28 + i * 12;
    tiff.writeUInt16LE(tag, at); tiff.writeUInt16LE(2, at + 2); tiff.writeUInt32LE(text.length + 1, at + 4); tiff.writeUInt32LE(position, at + 8);
    tiff.write(text, position); position += text.length + 1;
  });
  const length = Buffer.alloc(2); length.writeUInt16BE(tiff.length + 8);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, Buffer.from("Exif\0\0"), tiff, Buffer.from([0xff, 0xd9])]);
}

describe("camera dates and UTC storage", () => {
  it("extracts an actual EXIF capture date and offset, ignoring the later file date", async () => {
    const result = await readPhotoMetadata(cameraJpeg("2026:09:14 10:30:15", "-04:00"), { lastModified: Date.parse("2026-09-16T18:00:00Z"), timeZone: "Asia/Tokyo" });
    expect(result.capturedAtUtc?.toISOString()).toBe("2026-09-14T14:30:15.000Z");
    expect(result.photoDateSource).toBe("camera");
    expect(result.fileModifiedAtUtc?.toISOString()).toBe("2026-09-16T18:00:00.000Z");
  });
  it("uses the device time zone when the camera omitted its offset, marking the assumption", async () => {
    const result = await readPhotoMetadata(cameraJpeg("2026:09:14 10:30:15"), { timeZone: "America/New_York" });
    expect(result.capturedAtUtc?.toISOString()).toBe("2026-09-14T14:30:15.000Z");
    expect(result.photoDateSource).toBe("camera_timezone_assumed");
    expect(cameraDateToUtc("2026:01:14 10:30:00", undefined, "America/New_York")?.capturedAtUtc.toISOString()).toBe("2026-01-14T15:30:00.000Z");
  });
  it.each(["2026:02:30 10:00:00", "2026:13:14 10:00:00", "2026:09:14 24:00:00", "invalid"])("rejects impossible camera dates %s", (raw) => {
    expect(cameraDateToUtc(raw, "+00:00")).toBeNull();
  });
  it("does not invent a time zone or accept a nonexistent DST local time", () => {
    expect(cameraDateToUtc("2026:09:14 10:00:00", undefined)).toBeNull();
    expect(cameraDateToUtc("2026:03:08 02:30:00", undefined, "America/New_York")).toBeNull();
    expect(cameraDateToUtc("2026:09:14 10:00:00", "+18:00")).toBeNull();
  });
  it("falls back to a valid original file date without blocking malformed images", async () => {
    const result = await readPhotoMetadata(Buffer.from("no-exif"), { lastModified: Date.parse("2026-09-14T12:00:00Z") });
    expect(result.capturedAtUtc).toBeNull(); expect(result.photoDateSource).toBe("file_modified");
    expect((await readPhotoMetadata(Buffer.from("no-exif"), { lastModified: -1 })).photoDateSource).toBe("uploaded");
  });
});

describe("gallery-style inbox ordering", () => {
  const photos: SavedInboxPhoto[] = [
    { id: "one", fileName: "IMG_10.jpg", sizeBytes: 1, contentType: "image/jpeg", createdAtUtc: "2026-09-16T10:00:00Z", capturedAtUtc: "2026-09-14T10:00:00Z" },
    { id: "two", fileName: "IMG_2.jpg", sizeBytes: 1, contentType: "image/jpeg", createdAtUtc: "2026-09-15T10:00:00Z", fileModifiedAtUtc: "2026-09-15T09:00:00Z" },
    { id: "three", fileName: "IMG_1.jpg", sizeBytes: 1, contentType: "image/jpeg", createdAtUtc: "2026-09-15T08:00:00Z" }
  ];
  it.each([
    ["photo_newest", ["two", "three", "one"]], ["photo_oldest", ["one", "three", "two"]],
    ["upload_newest", ["one", "two", "three"]], ["upload_oldest", ["three", "two", "one"]],
    ["name_asc", ["three", "two", "one"]], ["name_desc", ["one", "two", "three"]]
  ] as const)("sorts by %s without modifying the original inbox", (order, ids) => {
    expect(sortInboxPhotos(photos, order).map((photo) => photo.id)).toEqual(ids);
    expect(photos.map((photo) => photo.id)).toEqual(["one", "two", "three"]);
  });
  it("labels capture, file, and upload dates honestly", () => {
    expect(photoDateLabel(photos[0])).toMatch(/^Taken /);
    expect(photoDateLabel(photos[1])).toContain("File date"); expect(photoDateLabel(photos[1])).toContain("capture time unavailable");
    expect(photoDateLabel(photos[2])).toContain("Uploaded");
    expect(photoDateLabel({ ...photos[0], photoDateSource: "camera_timezone_assumed" })).toContain("time zone estimated");
  });
});
