import { Buffer } from "node:buffer";

import {
  descriptionPhotoMaxBytes,
  descriptionPhotoMaxCount,
  descriptionPhotoMaxDimension
} from "@/lib/catalog/description-photos";

const jpegPrefix = "data:image/jpeg;base64,";
const invalidPhotoMessage = "One of the photos could not be read. Select the photo again and retry.";

// Inspect bounded JPEG segments without decompressing untrusted image pixels.
// Canvas-prepared baseline and progressive JPEGs are accepted. This checks the
// container and encoded dimensions; the provider still handles pixel decoding.
function hasValidJpegStructure(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let frameFound = false;
  let scanFound = false;
  let inScan = false;
  let hasScanData = false;
  while (offset < bytes.length) {
    if (inScan) {
      while (offset < bytes.length && bytes[offset] !== 0xff) {
        hasScanData = true;
        offset += 1;
      }
    }
    if (bytes[offset] !== 0xff) {
      return false;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return false;
    }
    const marker = bytes[offset++];
    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) {
      hasScanData = true;
      continue;
    }
    inScan = false;
    if (marker === 0xd9) {
      return frameFound && scanFound && hasScanData && offset === bytes.length;
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      return false;
    }
    if (offset + 2 > bytes.length) {
      return false;
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) {
      return false;
    }

    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (frameFound || ![0xc0, 0xc1, 0xc2].includes(marker) || length < 11) {
        return false;
      }
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7];
      if (bytes[offset + 2] !== 8 || ![1, 3, 4].includes(components) || length !== 8 + 3 * components
        || width < 1 || height < 1 || width > descriptionPhotoMaxDimension || height > descriptionPhotoMaxDimension) {
        return false;
      }
      frameFound = true;
    }
    if (marker === 0xda) {
      const components = bytes[offset + 2];
      if (!frameFound || length < 8 || ![1, 2, 3, 4].includes(components) || length !== 6 + 2 * components) {
        return false;
      }
      scanFound = true;
      inScan = true;
    }
    offset += length;
  }
  return false;
}

export function validateDescriptionPhotos(images: readonly string[] | undefined): string | null {
  if (images === undefined) {
    return null;
  }
  if (!Array.isArray(images) || images.length > descriptionPhotoMaxCount) {
    return `Use up to ${descriptionPhotoMaxCount} prepared JPEG photos for each item.`;
  }
  for (const image of images) {
    if (typeof image !== "string" || !image.startsWith(jpegPrefix)) {
      return invalidPhotoMessage;
    }
    const encoded = image.slice(jpegPrefix.length);
    if (!encoded || encoded.length > Math.ceil(descriptionPhotoMaxBytes / 3) * 4 || encoded.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
      return invalidPhotoMessage;
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > descriptionPhotoMaxBytes || bytes.toString("base64") !== encoded || !hasValidJpegStructure(bytes)) {
      return invalidPhotoMessage;
    }
  }
  return null;
}
