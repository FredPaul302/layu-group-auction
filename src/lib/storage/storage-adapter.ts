export type SaveAssetInput = {
  fileName: string;
  contentType: string;
  body: Buffer | Uint8Array | string;
};

export type StoredAsset = {
  key: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  publicUrl: string;
};

export type ReadStoredAsset = {
  key: string;
  contentType: string;
  body: Buffer;
  sizeBytes: number;
};

const contentTypeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

export function getContentTypeForAssetKey(key: string) {
  const extension = key.toLowerCase().match(/\.[a-z0-9]+$/u)?.[0] ?? "";

  return contentTypeByExtension[extension] ?? "application/octet-stream";
}

export interface StorageAdapter {
  save(input: SaveAssetInput): Promise<StoredAsset>;
  read(key: string): Promise<ReadStoredAsset>;
  remove(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
