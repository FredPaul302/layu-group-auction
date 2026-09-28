import { descriptionPhotoMaxBytes, descriptionPhotoMaxCount } from "@/lib/catalog/description-photos";

export type DescriptionDraftInput = {
  title: string;
  category: string;
  conditionNote: string;
  description: string;
  saleContext?: string;
  revisionInstructions?: string;
  images?: string[];
  includePriceSuggestion?: boolean;
  listingType?: "auction" | "fixed_price";
};

export const descriptionDraftLimits = {
  title: 200,
  category: 120,
  conditionNote: 2000,
  description: 4000
} as const;

export const descriptionSaleContextMaxCharacters = 2000;
export const defaultListingSaleContext = "All items in this auction sale are sold as-is and are tested and working at the time of sale unless the seller states otherwise. Do not invent specific test details. Do not add generic statements that functionality cannot be tested just because an item is furniture or another non-electronic item. Do not repeat the sale-wide testing status in every listing unless it is relevant or requested.";

export function validateDescriptionDraftInput(value: unknown):
  | { input: DescriptionDraftInput; error: null }
  | { input: null; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { input: null, error: "Item details are required." };
  }

  const record = value as Record<string, unknown>;
  const input = {} as DescriptionDraftInput;

  if (record.saleContext !== undefined) {
    if (typeof record.saleContext !== "string" || record.saleContext.length > descriptionSaleContextMaxCharacters) {
      return { input: null, error: `Keep sale-wide AI context within ${descriptionSaleContextMaxCharacters} characters.` };
    }
    input.saleContext = record.saleContext.trim();
  }

  if (record.revisionInstructions !== undefined) {
    if (typeof record.revisionInstructions !== "string" || record.revisionInstructions.length > 2000) {
      return { input: null, error: "Keep AI editing instructions within 2000 characters." };
    }
    if (record.revisionInstructions.trim()) input.revisionInstructions = record.revisionInstructions.trim();
  }
  if (input.revisionInstructions && (typeof record.description !== "string" || !record.description.trim())) {
    return { input: null, error: "Add a description before asking AI to revise it." };
  }

  if (record.includePriceSuggestion !== undefined && typeof record.includePriceSuggestion !== "boolean") {
    return { input: null, error: "Choose whether to include a price suggestion." };
  }
  if ((record.listingType !== undefined || record.includePriceSuggestion === true) &&
    record.listingType !== "auction" && record.listingType !== "fixed_price") {
    return { input: null, error: "Choose auction or fixed price before requesting a price suggestion." };
  }
  if (record.includePriceSuggestion !== undefined) input.includePriceSuggestion = record.includePriceSuggestion;
  if (record.listingType !== undefined) input.listingType = record.listingType as DescriptionDraftInput["listingType"];

  for (const field of Object.keys(descriptionDraftLimits) as Array<keyof typeof descriptionDraftLimits>) {
    const text = record[field];
    if (typeof text !== "string" || text.length > descriptionDraftLimits[field]) {
      return {
        input: null,
        error: `Use text within the AI drafting limit for ${field === "conditionNote" ? "condition note" : field} (${descriptionDraftLimits[field]} characters).`
      };
    }
    input[field] = text.trim();
  }

  if (record.images !== undefined) {
    if (!Array.isArray(record.images) || record.images.length > descriptionPhotoMaxCount || record.images.some((image) => (
      typeof image !== "string"
      || !image.startsWith("data:image/jpeg;base64,")
      || image.length > 23 + Math.ceil(descriptionPhotoMaxBytes / 3) * 4
    ))) {
      return { input: null, error: `Use up to ${descriptionPhotoMaxCount} prepared JPEG photos for each item.` };
    }
    input.images = record.images;
  }

  if (!input.images?.length && input.title.length < 3) {
    return { input: null, error: "Enter an item title of at least 3 characters first." };
  }

  if (!input.images?.length && !input.conditionNote && !input.description) {
    return { input: null, error: "Add condition notes or factual item details before drafting." };
  }

  return { input, error: null };
}
