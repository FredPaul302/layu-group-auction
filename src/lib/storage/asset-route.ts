export function buildStoredAssetRoute(key: string) {
  return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
}
