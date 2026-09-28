import { CatalogValidationError } from "./index";

export function normalizeListingSku(value: string | null | undefined): string | null {
  const sku = value?.trim().toUpperCase() || null;
  if (sku === null) return null;
  if (sku.length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(sku)) {
    throw new CatalogValidationError("sku_invalid", "Use a SKU of 80 characters or fewer, without line breaks or control characters.");
  }
  return /^\d{1,6}$/u.test(sku) ? sku.padStart(6, "0") : sku;
}

export function rethrowListingSkuError(error: unknown): never {
  const failure = error as { code?: string; meta?: { target?: unknown; database_error?: unknown }; message?: string } | null;
  if (failure?.code === "P2002" && JSON.stringify(failure.meta?.target ?? "").includes("sku")) {
    throw new CatalogValidationError("sku_duplicate", "That SKU is already assigned. Leave the SKU blank for an automatic number, or use a different SKU.");
  }
  if (failure?.code === "P2004" && `${failure.meta?.database_error ?? failure.message ?? ""}`.includes("999999")) {
    throw new CatalogValidationError("sku_exhausted", "Automatic SKUs have reached 999999. Enter a unique custom SKU to continue.");
  }
  throw error;
}
