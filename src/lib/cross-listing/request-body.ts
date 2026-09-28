import { CrossListingError } from "./service";

export async function readCrossListingRequest(request: Request): Promise<Record<string, unknown>> {
  const limit = 128 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new CrossListingError("This request is too large. Select up to 100 items or shorten the description.");
  const reader = request.body?.getReader();
  if (!reader) throw new CrossListingError("The request is empty.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.length;
      if (size > limit) { await reader.cancel(); throw new CrossListingError("This request is too large. Select up to 100 items or shorten the description."); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new CrossListingError("Invalid request.");
  return data;
}
