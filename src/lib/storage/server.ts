import path from "node:path";

import { getAppEnv, requireObjectStorageConfig } from "../config/app-env";
import { logStructuredEvent, serializeError } from "../ops/structured-logging";

import { LocalDevelopmentStorageAdapter } from "./local-development-storage-adapter";
import { ObjectStorageAdapter } from "./object-storage-adapter";

export function getStorageAdapter() {
  const env = getAppEnv();

  try {
    if (env.storage.driver === "object") {
      return new ObjectStorageAdapter(requireObjectStorageConfig());
    }

    return new LocalDevelopmentStorageAdapter({
      rootDirectory: path.resolve(process.cwd(), env.storage.local.uploadDir),
      publicBaseUrl: env.storage.local.publicBaseUrl
    });
  } catch (error) {
    logStructuredEvent("error", "storage_adapter_initialization_failed", {
      driver: env.storage.driver,
      error: serializeError(error)
    });
    throw error;
  }
}

export function getStoredAssetPublicUrl(key: string) {
  return getStorageAdapter().getPublicUrl(key);
}
