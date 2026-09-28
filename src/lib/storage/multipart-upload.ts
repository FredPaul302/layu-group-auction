import busboy from "busboy";
import { createWriteStream, openAsBlob } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export class MultipartUploadError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message); this.name = "MultipartUploadError";
  }
}

/** Spool multipart files to private temporary storage instead of buffering the entire batch in RAM. */
export async function readMultipartUpload(request: Request, limits: { bodyBytes: number; fileBytes: number; files: number }) {
  if (!request.body) throw new MultipartUploadError("upload_incomplete", "The upload was empty. Select your photos again.");
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: { "content-type": request.headers.get("content-type") ?? "" }, defParamCharset: "utf8",
      limits: { fileSize: limits.fileBytes + 1, files: limits.files, fields: 10, fieldSize: 1024 * 1024, parts: limits.files + 10 } });
  } catch { throw new MultipartUploadError("upload_incomplete", "The upload could not be read. Select your photos and retry."); }
  const directory = await mkdtemp(join(tmpdir(), "layu-upload-"));
  const cleanup = async () => {
    // Only remove this request's randomly generated directory beneath the system temp directory.
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("layu-upload-")) throw new Error("Unexpected upload temp directory");
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  };
  const entries: Array<{ name: string; value: string } | { name: string; path: string; filename: string; type: string }> = [];
  const writes: Promise<void>[] = [];
  let failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; };
  parser.on("field", (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated) fail(new MultipartUploadError("upload_fields_too_large", "The listing details are too large. Split this batch.", 413));
    entries.push({ name, value });
  });
  parser.on("file", (name, stream, info) => {
    // Client filenames are metadata only and never become filesystem paths.
    const path = join(directory, String(entries.length));
    entries.push({ name, path, filename: info.filename, type: info.mimeType });
    writes.push(pipeline(stream, createWriteStream(path, { flags: "wx", mode: 0o600 }))
      .then(() => { if (stream.truncated) fail(new MultipartUploadError("upload_file_too_large", `“${info.filename}” exceeds the ${limits.fileBytes / (1024 * 1024)} MB upload limit. Choose a smaller copy.`, 413)); })
      .catch((error: Error) => { fail(error); parser.destroy(error); }));
  });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const) parser.on(event, () => fail(new MultipartUploadError("upload_too_many_parts", "Too many files or fields. Split this batch and retry.", 413)));
  let size = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    callback(size > limits.bodyBytes ? new MultipartUploadError("upload_too_large", "This upload exceeds the batch limit. Split the selection and retry.", 413) : null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>), meter, parser);
    await Promise.all(writes);
    if (failure) throw failure;
    const formData = new FormData();
    for (const entry of entries) {
      if ("value" in entry) formData.append(entry.name, entry.value);
      else formData.append(entry.name, new File([await openAsBlob(entry.path, { type: entry.type })], entry.filename, { type: entry.type }));
    }
    return { formData, cleanup };
  } catch (error) {
    await Promise.all(writes);
    await cleanup();
    if (error instanceof MultipartUploadError) throw error;
    throw new MultipartUploadError("upload_incomplete", "The upload was interrupted or could not be read. No items from this request were saved. Check your connection and retry.");
  }
}
