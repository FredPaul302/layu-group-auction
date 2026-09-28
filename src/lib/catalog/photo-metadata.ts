import exifr from "exifr";

export type PhotoSourceDetails = { lastModified?: number; timeZone?: string };

function validDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2100 ? date : null;
}

export function cameraDateToUtc(raw: unknown, offset: unknown, timeZone?: string) {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendar = new Date(wall);
  if (year < 1900 || year > 2100 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  if (typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset.trim())) {
    const clean = offset.trim();
    const hours = Number(clean.slice(1, 3)), minutes = Number(clean.slice(4));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    const eastMinutes = (hours * 60 + minutes) * (clean[0] === "+" ? 1 : -1);
    return { capturedAtUtc: new Date(wall - eastMinutes * 60_000), photoDateSource: "camera" };
  }
  if (!timeZone) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    let candidate = wall;
    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
      const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      if (shown === wall) return { capturedAtUtc: new Date(candidate), photoDateSource: "camera_timezone_assumed" };
      candidate += wall - shown;
    }
  } catch { /* Invalid or unavailable time zone: retain the explicit fallback date. */ }
  return null;
}

export async function readPhotoMetadata(bytes: Uint8Array, source: PhotoSourceDetails = {}) {
  const fileModifiedAtUtc = validDate(source.lastModified);
  let captured: ReturnType<typeof cameraDateToUtc> = null;
  try {
    // Read only capture-time tags; location, serial numbers, and other EXIF fields are not retained.
    const tags = await exifr.parse(bytes, { gps: false, ifd1: false, xmp: false, icc: false, iptc: false, reviveValues: false,
      pick: ["DateTimeOriginal", "OffsetTimeOriginal", "CreateDate", "OffsetTimeDigitized"] });
    captured = cameraDateToUtc(tags?.DateTimeOriginal ?? tags?.CreateDate, tags?.OffsetTimeOriginal ?? tags?.OffsetTimeDigitized, source.timeZone);
  } catch { /* Missing or malformed metadata must not prevent a photo from being saved. */ }
  return { capturedAtUtc: captured?.capturedAtUtc ?? null, fileModifiedAtUtc,
    photoDateSource: captured?.photoDateSource ?? (fileModifiedAtUtc ? "file_modified" : "uploaded"), metadataVersion: 1 };
}
