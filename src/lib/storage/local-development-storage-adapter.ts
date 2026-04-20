import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { SaveAssetInput, StorageAdapter, StoredAsset } from "./storage-adapter";

type LocalDevelopmentStorageOptions = {
  rootDirectory: string;
  publicBaseUrl: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

export class LocalDevelopmentStorageAdapter implements StorageAdapter {
  constructor(private readonly options: LocalDevelopmentStorageOptions) {}

  async save(input: SaveAssetInput): Promise<StoredAsset> {
    const safeName = sanitizeFileName(input.fileName);
    const key = `${randomUUID()}-${safeName}`;
    const body =
      typeof input.body === "string" ? Buffer.from(input.body) : Buffer.from(input.body);
    const filePath = path.join(this.options.rootDirectory, key);

    await mkdir(this.options.rootDirectory, { recursive: true });
    await writeFile(filePath, body);

    return {
      key,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: body.byteLength,
      publicUrl: this.getPublicUrl(key)
    };
  }

  async remove(key: string): Promise<void> {
    const filePath = path.join(this.options.rootDirectory, key);

    await rm(filePath, { force: true });
  }

  getPublicUrl(key: string): string {
    const trimmedBaseUrl = this.options.publicBaseUrl.replace(/\/$/, "");

    return `${trimmedBaseUrl}/${key}`;
  }
}
