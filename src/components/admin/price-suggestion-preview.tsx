"use client";

import { formatSuggestedPrice, type PriceSuggestion, type PricingListingType } from "@/lib/catalog/price-suggestion";

export function PriceSuggestionPreview({ suggestion, listingType, applied = false, disabled = false, onApply }: {
  suggestion: PriceSuggestion | null;
  listingType: PricingListingType;
  applied?: boolean;
  disabled?: boolean;
  onApply: () => void;
}) {
  if (!suggestion) return <p className="text-sm text-zinc-600">AI could not suggest a reliable price from these details. Set the price yourself or add clearer identification and condition notes.</p>;
  const label = listingType === "auction" ? "starting bid" : "fixed price";
  return <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
    <p className="text-sm font-semibold text-zinc-900">Suggested {label}: {formatSuggestedPrice(suggestion.suggestedPriceCents)}</p>
    <p className="text-sm text-zinc-700">Estimated resale range: {formatSuggestedPrice(suggestion.resaleLowCents)}–{formatSuggestedPrice(suggestion.resaleHighCents)} USD</p>
    <p className="text-sm text-zinc-700">{suggestion.explanation}</p>
    <p className="text-xs text-zinc-600">Rough AI estimate; recent sold listings have not been checked. Review condition and comparable sales before choosing your price. {listingType === "auction" ? "An auction can sell at its starting bid." : "The asking price does not guarantee a sale."}</p>
    <button className="button-secondary px-3 py-2 text-sm disabled:opacity-50" disabled={disabled || applied} onClick={onApply} type="button">
      {applied ? "Price applied" : `Apply suggested ${label}`}
    </button>
    <p className="text-xs text-zinc-600">Applies only to the price field. Save or import separately to keep it.</p>
  </div>;
}
