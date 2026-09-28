import { CatalogValidationError } from "./index";

export function listingMutationErrorCode(error: unknown) {
  return error instanceof CatalogValidationError ? error.code : "unexpected";
}

export function listingErrorMessage(code: string) {
  const messages: Record<string, string> = {
    sku_invalid: "Use a SKU of 80 characters or fewer, without line breaks or control characters.",
    sku_duplicate: "That SKU is already assigned. Leave it blank for an automatic number, or enter a different SKU.",
    sku_locked: "A saved item's SKU stays with that item and cannot be changed.",
    sku_exhausted: "Automatic SKUs have reached 999999. Enter a unique custom SKU to continue.",
    inventory_linked_listing: "This listing is linked to inventory. Release unused stock from the listing in Inventory before relisting or duplicating it. Paid or committed stock cannot be released.",
    inventory_listing_committed: "This inventory item is already committed or sold. Its listing cannot be reset or republished. Use Inventory to manage unused stock and Orders to manage the sale.",
    listing_state_changed: "The listing or its orders changed while you were working. Refresh and review its current status before trying again.",
    listing_publish_invalid: "Only draft or published listings can be published. Use the existing order or inventory record for a completed sale.",
    end_at_utc_invalid: "Set the auction end time in the future before publishing.",
    auction_configuration_required: "Add the auction settings before publishing this listing.",
    unexpected: "The listing change could not be completed. Refresh the page and try again."
  };
  return messages[code] ?? `The listing change could not be completed (${code.replaceAll("_", " ")}). Check the listing details and try again.`;
}
