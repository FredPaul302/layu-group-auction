import { describe, expect, it } from "vitest";

import { validateDescriptionPhotos } from "../src/lib/ai/description-photo-validation.js";
import { descriptionPhotoMaxBytes } from "../src/lib/catalog/description-photos.js";
import { descriptionPhotoFixture, descriptionPhotoWithBytes } from "./fixtures/description-photo.js";

function mutatePhoto(change: (bytes: Buffer) => Buffer | void) {
  const bytes = Buffer.from(descriptionPhotoFixture.split(",")[1], "base64");
  return `data:image/jpeg;base64,${(change(bytes) ?? bytes).toString("base64")}`;
}

describe("description photo validation", () => {
  it("accepts real JPEGs, including the maximum count and byte size", () => {
    expect(validateDescriptionPhotos(undefined)).toBeNull();
    expect(validateDescriptionPhotos([])).toBeNull();
    expect(validateDescriptionPhotos(Array(3).fill(descriptionPhotoFixture))).toBeNull();
    expect(validateDescriptionPhotos([descriptionPhotoWithBytes(descriptionPhotoMaxBytes)])).toBeNull();
  });

  it.each([
    "https://example.com/photo.jpg",
    descriptionPhotoFixture.replace("image/jpeg", "image/png"),
    "data:image/jpeg;base64,",
    "data:image/jpeg;base64,????",
    descriptionPhotoFixture.replace("/9j/", "/9j/\n"),
    `${descriptionPhotoFixture}=`,
    descriptionPhotoFixture.replace(/A\/9k=$/u, "A/9l="),
    "data:image/jpeg;base64,iVBORw0KGgo=",
    descriptionPhotoWithBytes(descriptionPhotoMaxBytes + 1),
    mutatePhoto((bytes) => { bytes[0] = 0; }),
    mutatePhoto((bytes) => bytes.subarray(0, -2)),
    mutatePhoto((bytes) => Buffer.concat([bytes, Buffer.from([0])])),
    mutatePhoto((bytes) => { bytes.writeUInt16BE(1, 4); }),
    mutatePhoto((bytes) => { bytes.writeUInt16BE(65535, 4); }),
    mutatePhoto((bytes) => { bytes.writeUInt16BE(1025, bytes.indexOf(Buffer.from([0xff, 0xc0])) + 7); }),
    mutatePhoto((bytes) => { bytes.writeUInt16BE(1025, bytes.indexOf(Buffer.from([0xff, 0xc0])) + 5); }),
    mutatePhoto((bytes) => { bytes.writeUInt16BE(0, bytes.indexOf(Buffer.from([0xff, 0xc0])) + 7); }),
    mutatePhoto((bytes) => { bytes[bytes.indexOf(Buffer.from([0xff, 0xc0])) + 1] = 0xfe; }),
    mutatePhoto((bytes) => { bytes[bytes.indexOf(Buffer.from([0xff, 0xda])) + 1] = 0xfe; })
  ])("rejects malformed, remote, oversized, or incorrectly encoded photos", (image) => {
    expect(validateDescriptionPhotos([image])).toBeTypeOf("string");
  });

  it("enforces count and both dimension bounds independently of byte size", () => {
    expect(validateDescriptionPhotos(Array(4).fill(descriptionPhotoFixture))).toBeTypeOf("string");
    expect(validateDescriptionPhotos([mutatePhoto((bytes) => {
      const frame = bytes.indexOf(Buffer.from([0xff, 0xc0]));
      bytes.writeUInt16BE(1024, frame + 5);
      bytes.writeUInt16BE(1024, frame + 7);
    })])).toBeNull();
  });
});
