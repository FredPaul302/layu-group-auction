import path from "node:path";

import { getAppEnv } from "../config/app-env";

import { LocalDevelopmentStorageAdapter } from "./local-development-storage-adapter";

export function getStorageAdapter() {
  const env = getAppEnv();

  return new LocalDevelopmentStorageAdapter({
    rootDirectory: path.resolve(process.cwd(), env.localUploadDir),
    publicBaseUrl: env.localUploadBaseUrl
  });
}

export function getStoredAssetPublicUrl(key: string) {
  return getStorageAdapter().getPublicUrl(key);
}
