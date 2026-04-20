const DEFAULT_LOCAL_STORAGE_DIR = ".local/uploads";
const DEFAULT_PUBLIC_BASE_URL = "http://localhost:3000/uploads";

export type AppEnv = {
  appUrl: string;
  databaseUrl: string | null;
  localUploadDir: string;
  localUploadBaseUrl: string;
};

export function getAppEnv(): AppEnv {
  return {
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    databaseUrl: process.env.DATABASE_URL ?? null,
    localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? DEFAULT_LOCAL_STORAGE_DIR,
    localUploadBaseUrl:
      process.env.LOCAL_PUBLIC_UPLOAD_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL
  };
}
