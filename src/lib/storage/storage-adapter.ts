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

export interface StorageAdapter {
  save(input: SaveAssetInput): Promise<StoredAsset>;
  remove(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
