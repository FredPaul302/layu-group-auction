import { crc32 } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { photoCrc32, photoZip } from "../src/lib/cross-listing/photo-archive";

async function collect(source: AsyncGenerator<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Read through ZIP's central directory, independently of the writer's generated chunks.
// Validate checksums with Node's zlib implementation, not the application's CRC routine.
function readStoredArchive(archive: Buffer) {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  expect(archive.readUInt16LE(end + 4)).toBe(0);
  expect(archive.readUInt16LE(end + 6)).toBe(0);
  expect(archive.readUInt16LE(end + 20)).toBe(0);
  const count = archive.readUInt16LE(end + 10);
  expect(archive.readUInt16LE(end + 8)).toBe(count);
  let directoryOffset = archive.readUInt32LE(end + 16);
  expect(directoryOffset + archive.readUInt32LE(end + 12)).toBe(end);
  const files: { name: string; body: Buffer }[] = [];
  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(directoryOffset)).toBe(0x02014b50);
    expect(archive.readUInt16LE(directoryOffset + 8) & 1).toBe(0);
    expect(archive.readUInt16LE(directoryOffset + 10)).toBe(0);
    const checksum = archive.readUInt32LE(directoryOffset + 16);
    const length = archive.readUInt32LE(directoryOffset + 24);
    expect(archive.readUInt32LE(directoryOffset + 20)).toBe(length);
    const nameLength = archive.readUInt16LE(directoryOffset + 28);
    const extraLength = archive.readUInt16LE(directoryOffset + 30);
    const commentLength = archive.readUInt16LE(directoryOffset + 32);
    const name = archive.subarray(directoryOffset + 46, directoryOffset + 46 + nameLength).toString("utf8");
    const localOffset = archive.readUInt32LE(directoryOffset + 42);
    expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
    expect(archive.readUInt16LE(localOffset + 8)).toBe(0);
    expect(archive.readUInt32LE(localOffset + 14)).toBe(checksum);
    expect(archive.readUInt32LE(localOffset + 18)).toBe(length);
    expect(archive.readUInt32LE(localOffset + 22)).toBe(length);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    expect(archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8")).toBe(name);
    const body = archive.subarray(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + length);
    expect(body.length).toBe(length);
    expect(crc32(body)).toBe(checksum);
    files.push({ name, body });
    directoryOffset += 46 + nameLength + extraLength + commentLength;
  }
  expect(directoryOffset).toBe(end);
  return files;
}

describe("ordered listing photo downloads", () => {
  it("produces a standard stored ZIP preserving image bytes, names and order", async () => {
    const photos = [
      { name: "01-photo.jpg", body: Buffer.from([0xff, 0xd8, 0, 1, 2, 0x50, 0x4b, 3, 4, 0xff, 0xd9]) },
      { name: "02-photo.png", body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]) }
    ];
    const archive = await collect(photoZip(photos.map((photo) => ({ name: photo.name, read: async () => photo.body }))));
    expect(readStoredArchive(archive)).toEqual(photos);
    expect(photoCrc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("keeps archive names flat and extracts the original bytes", async () => {
    const bytes = Buffer.from("image bytes");
    const archive = await collect(photoZip([{ name: "../folder\\03-photo.jpg", read: async () => bytes }]));
    const files = readStoredArchive(archive);
    expect(files).toEqual([{ name: ".._folder_03-photo.jpg", body: bytes }]);
    expect(files[0].name).not.toMatch(/[/\\]/);
  });

  it("can close an empty archive cleanly", async () => {
    expect(readStoredArchive(await collect(photoZip([])))).toEqual([]);
  });

  it("does not load later photos ahead of consumption and stops after cancellation", async () => {
    const first = vi.fn(async () => Buffer.from("first"));
    const second = vi.fn(async () => Buffer.from("second"));
    const iterator = photoZip([{ name: "01.jpg", read: first }, { name: "02.jpg", read: second }]);
    expect(first).not.toHaveBeenCalled();
    await iterator.next();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await iterator.next();
    expect(second).not.toHaveBeenCalled();
    await iterator.return(undefined);
    expect(second).not.toHaveBeenCalled();
  });

  it("fails the download for empty or oversized stored files", async () => {
    await expect(collect(photoZip([{ name: "01.jpg", read: async () => Buffer.alloc(0) }]))).rejects.toThrow("unavailable or too large");
    await expect(collect(photoZip([{ name: "01.jpg", read: async () => Buffer.alloc(20 * 1024 * 1024 + 1) }]))).rejects.toThrow("unavailable or too large");
  });
});
