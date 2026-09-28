import type { BidTier, FulfillmentMode, ListingType } from "@prisma/client";
import { formatMoney, moneyFormValue } from "@/lib/money";
export { formatMoney } from "@/lib/money";

export const catalogCategoryTierOptions = ["tier_1", "tier_20"] as const;
export type CatalogCategoryTier = (typeof catalogCategoryTierOptions)[number];

export const editableListingStates = ["draft", "published"] as const;
export type EditableListingState = (typeof editableListingStates)[number];

export const listingImageAcceptedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif"
] as const;
export const listingImageAcceptValue = listingImageAcceptedMimeTypes.join(",");
export const listingImageMaxCount = 8;
export const listingImageMaxSizeBytes = 20 * 1024 * 1024;

export class CatalogValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isCatalogCategoryTier(value: string): value is CatalogCategoryTier {
  return catalogCategoryTierOptions.includes(value as CatalogCategoryTier);
}

export function hasCategoryTierAssignment(requiredBidTier: BidTier) {
  return isCatalogCategoryTier(requiredBidTier) || requiredBidTier === "tier_10";
}

export function parseRequiredText(value: string | null | undefined, fieldLabel: string) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new CatalogValidationError(`${fieldLabel}_required`, `${fieldLabel} is required.`);
  }

  return normalizedValue;
}

export function parseOptionalText(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue ? normalizedValue : null;
}

export function parseMoneyFormInput(form: FormData, dollarsName: string, label: string,
  options: { minimum?: number; required?: boolean } = {}) {
  const legacyName = `${dollarsName}Cents`;
  const raw = form.get(form.has(dollarsName) ? dollarsName : legacyName);
  if (options.required === false && (raw == null || raw === "")) return null;
  const cents = moneyFormValue(form, dollarsName, legacyName);
  if (!Number.isSafeInteger(cents)) {
    throw new CatalogValidationError(`${dollarsName}_invalid`, `${label} must be a dollar amount with at most two decimal places.`);
  }
  if (cents < (options.minimum ?? 0)) {
    throw new CatalogValidationError(`${dollarsName}_too_small`, `${label} must be at least ${formatMoney(options.minimum ?? 0)}.`);
  }
  return cents;
}

export function parseIntegerInput(
  value: string | null | undefined,
  fieldLabel: string,
  options?: {
    minimum?: number;
    required?: boolean;
  }
) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    if (options?.required === false) {
      return null;
    }

    throw new CatalogValidationError(`${fieldLabel}_required`, `${fieldLabel} is required.`);
  }

  if (!/^-?\d+$/u.test(normalizedValue)) {
    throw new CatalogValidationError(
      `${fieldLabel}_invalid`,
      `${fieldLabel} must be a whole number.`
    );
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new CatalogValidationError(
      `${fieldLabel}_invalid`,
      `${fieldLabel} must be a safe integer value.`
    );
  }

  if (parsedValue < (options?.minimum ?? Number.MIN_SAFE_INTEGER)) {
    throw new CatalogValidationError(
      `${fieldLabel}_too_small`,
      `${fieldLabel} must be at least ${options?.minimum}.`
    );
  }

  return parsedValue;
}

export function parseOptionalDateTime(value: string | null | undefined, fieldLabel: string) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = new Date(normalizedValue);

  if (Number.isNaN(parsedValue.getTime())) {
    throw new CatalogValidationError(
      `${fieldLabel}_invalid`,
      `${fieldLabel} must be a valid date and time.`
    );
  }

  return parsedValue;
}

export function parseEditableListingState(value: string | null | undefined): EditableListingState {
  if (value === "published") {
    return "published";
  }

  return "draft";
}

export function validateCategoryInput(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
  minimumStartBidCents: number;
  minimumBidIncrementCents: number;
  requiredBidTier: string;
}) {
  const name = parseRequiredText(input.name, "name");
  const slug = slugify(parseOptionalText(input.slug) ?? name);

  if (!slug) {
    throw new CatalogValidationError("slug_required", "slug is required.");
  }

  if (!isCatalogCategoryTier(input.requiredBidTier)) {
    throw new CatalogValidationError(
      "required_bid_tier_invalid",
      "required bid tier must be tier_1 or tier_20."
    );
  }

  if (input.minimumStartBidCents < 0) {
    throw new CatalogValidationError(
      "minimum_start_bid_cents_invalid",
      "Minimum start bid cannot be negative."
    );
  }

  if (input.minimumBidIncrementCents <= 0) {
    throw new CatalogValidationError(
      "minimum_bid_increment_cents_invalid",
      "Minimum bid increment must be at least $0.01."
    );
  }

  return {
    name,
    slug,
    description: parseOptionalText(input.description),
    minimumStartBidCents: input.minimumStartBidCents,
    minimumBidIncrementCents: input.minimumBidIncrementCents,
    requiredBidTier: input.requiredBidTier
  };
}

export function validatePickupEventInput(input: {
  name: string;
  slug?: string | null;
  locationName: string;
  address?: string | null;
  instructions?: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
}) {
  const name = parseRequiredText(input.name, "name");
  const slug = slugify(parseOptionalText(input.slug) ?? name);
  const locationName = parseRequiredText(input.locationName, "location_name");

  if (!slug) {
    throw new CatalogValidationError("slug_required", "slug is required.");
  }

  if (input.endAtUtc.getTime() <= input.startAtUtc.getTime()) {
    throw new CatalogValidationError(
      "pickup_event_time_range_invalid",
      "pickup event end time must be after the start time."
    );
  }

  return {
    name,
    slug,
    locationName,
    address: parseOptionalText(input.address),
    instructions: parseOptionalText(input.instructions),
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc
  };
}

export function validateListingInput(input: {
  title: string;
  description?: string | null;
  categoryId: string;
  listingType: ListingType;
  conditionNote?: string | null;
  fulfillmentMode: FulfillmentMode;
  shippingFeeCents: number;
  shippingNotes?: string | null;
  pickupEventId?: string | null;
  fixedPriceCents?: number | null;
  startingBidCents?: number | null;
  endAtUtc?: Date | null;
  saveAs: EditableListingState;
  categoryMinimumStartBidCents: number;
  categoryMinimumBidIncrementCents: number;
}) {
  const title = parseRequiredText(input.title, "title");
  const categoryId = parseRequiredText(input.categoryId, "category_id");

  if (input.shippingFeeCents < 0) {
    throw new CatalogValidationError(
      "shipping_fee_cents_invalid",
      "Shipping fee cannot be negative."
    );
  }

  if (input.fulfillmentMode === "pickup_only" && input.shippingFeeCents !== 0) {
    throw new CatalogValidationError(
      "shipping_fee_cents_invalid",
      "pickup-only listings must use a zero shipping fee."
    );
  }

  if (input.fulfillmentMode === "shipping_only" && input.pickupEventId) {
    throw new CatalogValidationError(
      "pickup_event_id_invalid",
      "shipping-only listings cannot be assigned to a pickup event."
    );
  }

  if (input.listingType === "fixed_price") {
    if (!input.fixedPriceCents || !Number.isSafeInteger(input.fixedPriceCents) || input.fixedPriceCents <= 0) {
      throw new CatalogValidationError(
        "fixed_price_cents_required",
        "Fixed-price listings must include a Buy It Now price of at least $0.01."
      );
    }

    if (input.startingBidCents != null || input.endAtUtc) {
      throw new CatalogValidationError(
        "auction_fields_not_allowed",
        "fixed-price listings cannot include auction-only fields."
      );
    }
  }

  if (input.listingType === "auction") {
    if (input.fixedPriceCents != null && (!Number.isSafeInteger(input.fixedPriceCents) ||
      input.fixedPriceCents <= (input.startingBidCents ?? 0))) {
      throw new CatalogValidationError(
        "buy_now_price_invalid",
        "The Buy It Now price must be above the starting bid, with at most two decimal places."
      );
    }

    if (input.startingBidCents == null) {
      throw new CatalogValidationError(
        "starting_bid_cents_required",
        "Auction listings must include a starting bid in dollars."
      );
    }

    if (input.startingBidCents < input.categoryMinimumStartBidCents) {
      throw new CatalogValidationError(
        "starting_bid_cents_too_small",
        "auction starting bid must meet the category minimum."
      );
    }

    if (!input.endAtUtc) {
      throw new CatalogValidationError(
        "end_at_utc_required",
        "auction listings must include an end date and time."
      );
    }

    if (input.saveAs === "published" && input.endAtUtc.getTime() <= Date.now()) {
      throw new CatalogValidationError(
        "end_at_utc_invalid",
        "published auctions must end in the future."
      );
    }
  }

  return {
    title,
    slug: slugify(title),
    description: parseOptionalText(input.description),
    categoryId,
    listingType: input.listingType,
    conditionNote: parseOptionalText(input.conditionNote),
    fulfillmentMode: input.fulfillmentMode,
    shippingFeeCents: input.shippingFeeCents,
    shippingNotes: parseOptionalText(input.shippingNotes),
    pickupEventId: parseOptionalText(input.pickupEventId),
    fixedPriceCents: input.fixedPriceCents ?? null,
    startingBidCents: input.listingType === "auction" ? input.startingBidCents ?? null : null,
    endAtUtc: input.listingType === "auction" ? input.endAtUtc ?? null : null,
    saveAs: input.saveAs,
    categoryMinimumBidIncrementCents: input.categoryMinimumBidIncrementCents
  };
}
