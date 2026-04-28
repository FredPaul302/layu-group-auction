import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { logStructuredEvent, serializeError } from "../ops/structured-logging";

import {
  getContentTypeForAssetKey,
  type ReadStoredAsset,
  type SaveAssetInput,
  type StorageAdapter,
  type StoredAsset
} from "./storage-adapter";

type LocalDevelopmentStorageOptions = {
  rootDirectory: string;
  publicBaseUrl: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

function resolveStoredFilePath(rootDirectory: string, key: string) {
  const rootPath = path.resolve(rootDirectory);
  const filePath = path.resolve(rootPath, key);
  const relativePath = path.relative(rootPath, filePath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Storage key resolves outside the upload directory.");
  }

  return filePath;
}

export class LocalDevelopmentStorageAdapter implements StorageAdapter {
  constructor(private readonly options: LocalDevelopmentStorageOptions) {}

  async save(input: SaveAssetInput): Promise<StoredAsset> {
    const safeName = sanitizeFileName(input.fileName);
    const key = `${randomUUID()}-${safeName}`;
    const body =
      typeof input.body === "string" ? Buffer.from(input.body) : Buffer.from(input.body);
    const filePath = path.join(this.options.rootDirectory, key);

    try {
      await mkdir(this.options.rootDirectory, { recursive: true });
      await writeFile(filePath, body);
    } catch (error) {
      logStructuredEvent("error", "storage_save_failed", {
        driver: "local",
        fileName: input.fileName,
        key,
        rootDirectory: this.options.rootDirectory,
        error: serializeError(error)
      });
      throw error;
    }

    return {
      key,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: body.byteLength,
      publicUrl: this.getPublicUrl(key)
    };
  }

  async read(key: string): Promise<ReadStoredAsset> {
    const filePath = resolveStoredFilePath(this.options.rootDirectory, key);
    const body = await readFile(filePath);

    return {
      key,
      contentType: getContentTypeForAssetKey(key),
      body,
      sizeBytes: body.byteLength
    };
  }

  async remove(key: string): Promise<void> {
    const filePath = resolveStoredFilePath(this.options.rootDirectory, key);

    try {
      await rm(filePath, { force: true });
    } catch (error) {
      logStructuredEvent("error", "storage_remove_failed", {
        driver: "local",
        key,
        rootDirectory: this.options.rootDirectory,
        error: serializeError(error)
      });
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    const trimmedBaseUrl = this.options.publicBaseUrl.replace(/\/$/, "");

    return `${trimmedBaseUrl}/${key}`;
  }
}
