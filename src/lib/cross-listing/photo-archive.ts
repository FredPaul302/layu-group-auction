// ZIP with stored entries, streamed one photograph at a time. No extra compression of JPEGs.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function photoCrc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function* photoZip(photos: { name: string; read: () => Promise<Uint8Array> }[]): AsyncGenerator<Uint8Array> {
  const directory: Buffer[] = [];
  let offset = 0;
  for (const photo of photos) {
    const name = Buffer.from(photo.name.replace(/[^a-zA-Z0-9_.-]/g, "_"));
    const body = await photo.read();
    if (!body.length || body.length > 20 * 1024 * 1024) throw new Error("A photo is unavailable or too large for this download.");
    const crc = photoCrc32(body);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); name.copy(central, 46);
    directory.push(central); offset += local.length + body.length;
    yield local; yield body;
  }
  const size = directory.reduce((total, chunk) => total + chunk.length, 0);
  for (const entry of directory) yield entry;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(photos.length, 8); end.writeUInt16LE(photos.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  yield end;
}
