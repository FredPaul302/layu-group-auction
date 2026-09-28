export type PriceSuggestion = {
  suggestedPriceCents: number;
  resaleLowCents: number;
  resaleHighCents: number;
  explanation: string;
};

export type PricingListingType = "auction" | "fixed_price";
export const priceSuggestionMaxCents = 99_999_999;

export function isPriceSuggestion(value: unknown, listingType?: PricingListingType): value is PriceSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || typeof record.explanation !== "string" ||
    !record.explanation.trim() || record.explanation.length > 600) return false;
  const amounts = [record.suggestedPriceCents, record.resaleLowCents, record.resaleHighCents];
  if (!amounts.every((amount) => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 1 && amount <= priceSuggestionMaxCents)) return false;
  const { suggestedPriceCents, resaleLowCents, resaleHighCents } = record as PriceSuggestion;
  return resaleLowCents <= resaleHighCents && suggestedPriceCents <= resaleHighCents &&
    (listingType !== "fixed_price" || suggestedPriceCents >= resaleLowCents);
}

export function formatSuggestedPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
