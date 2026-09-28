import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createListingDescriptionDraft, pricedDraftMaxOutputTokens } from "../src/lib/ai/listing-description";
import { validateDescriptionDraftInput } from "../src/lib/catalog/description-draft-input";
import { isPriceSuggestion } from "../src/lib/catalog/price-suggestion";
import { PriceSuggestionPreview } from "../src/components/admin/price-suggestion-preview";
import { getBulkDescriptionDraftChanges, getBulkDescriptionSourceKey, getBulkPriceSuggestionChanges, runBulkDescriptionQueue, type BulkDescriptionDraft } from "../src/lib/catalog/bulk-description-drafts";
import type { BulkListingItemInput } from "../src/lib/catalog/bulk-listings";

const estimate = { suggestedPriceCents: 2500, resaleLowCents: 2000, resaleHighCents: 4000, explanation: "A rough estimate for an untested, scratched item. Check comparable sales." };
const facts = { title: "Wooden side table", category: "Furniture", conditionNote: "Scratched top", description: "Two drawers", includePriceSuggestion: true, listingType: "fixed_price" as const };
const draft = { title: "Wooden side table", description: "Two drawers and a scratched top.", conditionNote: "Scratched top", priceSuggestion: estimate };
const row: BulkListingItemInput = { clientId: "row", title: "Table", description: "Two drawers", categorySlug: "furniture", sku: "", listingType: "fixed_price", priceCents: "1500", imageFileIds: ["one"], videoFileIds: [] };
function preview(item = row): BulkDescriptionDraft {
  return { ...draft, sourceKey: getBulkDescriptionSourceKey(item), status: "ready", message: "Ready" };
}
function providerResponse(provider: string, value: unknown) {
  return provider === "gemini" ? { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(value) }] } }] }
    : { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value) }] }] };
}
afterEach(() => { vi.unstubAllEnvs(); });

describe("AI price suggestions", () => {
  it.each(["gemini", "openai"])("uses one %s request for all suggestions and keeps prices out of listing copy", async (provider) => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", provider);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse(provider, draft)));
    expect(await createListingDescriptionDraft(facts, fetchMock)).toEqual(draft);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.generationConfig?.maxOutputTokens ?? body.max_output_tokens).toBe(pricedDraftMaxOutputTokens);
    const schema = body.generationConfig?.responseJsonSchema ?? body.text.format.schema;
    expect(schema.required).toEqual(["title", "description", "conditionNote", "priceSuggestion"]);
    expect(schema.properties.priceSuggestion.type).toEqual(["object", "null"]);
    const instruction = body.systemInstruction?.parts[0].text ?? body.instructions;
    expect(instruction).toContain("no live market search");
    expect(instruction).toContain("Keep all prices out of the title and description");
    expect(instruction).toContain("Return null");
    expect(body.tools).toBeUndefined();
  });

  it.each([null, { ...estimate, suggestedPriceCents: 0 }, { ...estimate, suggestedPriceCents: 1.5 }, { ...estimate, suggestedPriceCents: "2500" }, { ...estimate, suggestedPriceCents: -1 }, { ...estimate, suggestedPriceCents: Number.MAX_SAFE_INTEGER }, { ...estimate, resaleLowCents: 5000 }, { ...estimate, explanation: "" }, { ...estimate, explanation: "x".repeat(601) }, { ...estimate, currency: "EUR" }])("rejects unsafe or malformed price estimates: %j", (value) => {
    expect(isPriceSuggestion(value, "fixed_price")).toBe(false);
  });

  it("distinguishes an auction starting bid from the resale range", () => {
    expect(isPriceSuggestion({ ...estimate, suggestedPriceCents: 500 }, "auction")).toBe(true);
    expect(isPriceSuggestion({ ...estimate, suggestedPriceCents: 500 }, "fixed_price")).toBe(false);
    expect(isPriceSuggestion({ ...estimate, suggestedPriceCents: 5000 }, "auction")).toBe(false);
  });

  it("allows explicit abstention while preserving the title and description", async () => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse("gemini", { ...draft, priceSuggestion: null })));
    expect(await createListingDescriptionDraft(facts, fetchMock)).toEqual({ ...draft, priceSuggestion: null });
    fetchMock.mockResolvedValue(Response.json(providerResponse("gemini", { ...draft, priceSuggestion: { ...estimate, suggestedPriceCents: "2500" } })));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ code: "description_provider_unavailable" });
  });

  it.each([{ includePriceSuggestion: "yes" }, { listingType: undefined }, { listingType: "sale" }])("validates pricing intent before contacting the provider: %j", (update) => {
    expect(validateDescriptionDraftInput({ ...facts, ...update }).input).toBeNull();
  });

  it("applies price separately, to the correct field, in integer cents", () => {
    const fixed = preview();
    expect(getBulkPriceSuggestionChanges(row, fixed)).toEqual({ priceCents: "2500" });
    expect(getBulkDescriptionDraftChanges(row, fixed)).toEqual({ title: draft.title, description: draft.description, condition: draft.conditionNote });
    const auction = { ...row, listingType: "auction" as const };
    expect(getBulkPriceSuggestionChanges(auction, preview(auction))).toEqual({ startingBidCents: "2500" });
    expect(row.priceCents).toBe("1500");
  });

  it("can apply title, description, condition and an auction starting price together without changing the Buy It Now price", () => {
    const auction = { ...row, listingType: "auction" as const, priceCents: "7500", condition: "Old note" };
    const ready = preview(auction);
    const applied = { ...auction, ...getBulkDescriptionDraftChanges(auction, ready), ...getBulkPriceSuggestionChanges(auction, ready) };
    expect(applied).toMatchObject({ title: draft.title, description: draft.description, condition: draft.conditionNote, startingBidCents: "2500", priceCents: "7500" });
    const revision = { ...ready, descriptionOnly: true };
    expect(getBulkPriceSuggestionChanges(auction, revision)).toBeNull();
  });

  it.each([{ priceCents: "3000" }, { startingBidCents: "500" }, { listingType: "auction" as const }, { description: "Manual edit" }, { condition: "Broken" }, { imageFileIds: ["two"] }])("preserves manual edits and rejects stale price previews: %j", (update) => {
    expect(getBulkPriceSuggestionChanges({ ...row, ...update }, preview())).toBeNull();
  });

  it("supports applying text before price or price before text without another AI call", () => {
    const original = preview();
    const withText = { ...row, ...getBulkDescriptionDraftChanges(row, original) };
    const afterText: BulkDescriptionDraft = { ...original, status: "applied", sourceKey: getBulkDescriptionSourceKey(withText) };
    expect(getBulkPriceSuggestionChanges(withText, afterText)).toEqual({ priceCents: "2500" });
    const withPrice = { ...row, ...getBulkPriceSuggestionChanges(row, original) };
    const afterPrice = { ...original, priceApplied: true, sourceKey: getBulkDescriptionSourceKey(withPrice) };
    expect(getBulkDescriptionDraftChanges(withPrice, afterPrice)).toEqual({ title: draft.title, description: draft.description, condition: draft.conditionNote });
    expect(getBulkPriceSuggestionChanges(withPrice, afterPrice)).toBeNull();
    expect(getBulkPriceSuggestionChanges(row, { ...original, status: "discarded" })).toBeNull();
  });

  it("carries optional pricing through the existing sequential bulk queue", async () => {
    const updates: BulkDescriptionDraft[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...draft, status: "description_draft_ready" }));
    await runBulkDescriptionQueue({ jobs: [{ clientId: row.clientId, sourceKey: getBulkDescriptionSourceKey(row), input: facts, files: [] }],
      signal: new AbortController().signal, prepare: async () => [], fetchImpl: fetchMock, onProgress: () => {}, onUpdate: (_, value) => updates.push(value) });
    expect(updates.at(-1)).toMatchObject({ status: "ready", priceSuggestion: estimate, pricingListingType: "fixed_price" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({ includePriceSuggestion: true, listingType: "fixed_price" });
    expect(row.priceCents).toBe("1500");
  });

  it("labels USD estimates and auction risk, with an explicit non-submit Apply button", () => {
    const html = renderToStaticMarkup(<PriceSuggestionPreview suggestion={estimate} listingType="auction" onApply={() => {}} />);
    expect(html).toContain("Suggested starting bid: $25.00");
    expect(html).toContain("$20.00–$40.00 USD");
    expect(html).toContain("recent sold listings have not been checked");
    expect(html).toContain("An auction can sell at its starting bid");
    expect(html).toContain('type="button"');
    const abstained = renderToStaticMarkup(<PriceSuggestionPreview suggestion={null} listingType="fixed_price" onApply={() => {}} />);
    expect(abstained).not.toContain("<button");
    expect(abstained).toContain("could not suggest a reliable price");
  });
});
