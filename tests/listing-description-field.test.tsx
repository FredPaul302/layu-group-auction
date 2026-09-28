import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { canApplyItemPrice, isSameItem, ListingDescriptionField } from "../src/components/admin/listing-description-field.js";

describe("listing description field", () => {
  it("keeps the existing description and makes AI generation an explicit non-submit action", () => {
    const html = renderToStaticMarkup(<ListingDescriptionField aiEnabled initialTitle="Vintage radio" initialDescription="Existing description with a scratch disclosure." />);
    expect(html).toContain('name="title"');
    expect(html).toContain('value="Vintage radio"');
    expect(html).toContain('name="description"');
    expect(html).toContain("Existing description with a scratch disclosure.");
    expect(html).toContain('type="button"');
    expect(html).toContain("Draft with AI");
    expect(html).toContain('name="conditionNote"');
    expect(html).toContain("AI editing instructions");
    expect(html).toContain("Revise description with AI");
    expect(html).toContain("Describe uploaded photos");
    expect(html).toContain("first 3 newly selected images");
    expect(html).toContain("original uploads stay intact");
    expect(html).not.toContain("AI draft preview");
    expect(html).not.toContain("Apply draft");
  });

  it("leaves manual description entry available when AI drafting is off", () => {
    const html = renderToStaticMarkup(<ListingDescriptionField aiEnabled={false} initialTitle="Manual title" initialDescription="Manual copy." />);
    expect(html).toContain("AI drafting is currently turned off");
    expect(html).toContain('disabled=""');
    expect(html).toMatch(/<textarea[^>]*name="description"[^>]*>Manual copy\.<\/textarea>/u);
  });

  it("keeps saved photo inspection and the upload input beside item details", () => {
    const html = renderToStaticMarkup(<ListingDescriptionField aiEnabled initialTitle="Radio" initialDescription="Untested."
      savedImages={[{ id: "photo-1", src: "/uploads/radio.jpg", filename: "radio.jpg", alt: "Radio front" }]} />);
    expect(html).toContain('name="images"');
    expect(html).toContain('aria-label="Saved photos for this item"');
    expect(html).toContain('aria-label="Enlarge photo: radio.jpg"');
    expect(html).toContain('alt="Radio front"');
    expect(html.indexOf("Saved photos (1)")).toBeLessThan(html.indexOf('name="title"'));
    expect(html.match(/name="title"/gu)).toHaveLength(1);
    expect(html.match(/name="description"/gu)).toHaveLength(1);
  });

  it("rejects applying stale drafts after edits to either field, facts, or photos", () => {
    const front = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const back = new File(["back"], "back.jpg", { type: "image/jpeg" });
    const source = { facts: { title: "Radio", description: "Untested", category: "Electronics", conditionNote: "Scratch" }, photos: [front, back],
      pricing: { listingType: "auction" as const, fixedPriceCents: "", startingBidCents: "1000" } };
    expect(isSameItem({ ...source, photos: [...source.photos] }, source, true)).toBe(true);
    for (const field of ["title", "description", "category", "conditionNote"] as const) {
      expect(isSameItem({ ...source, facts: { ...source.facts, [field]: "Edited" } }, source, true)).toBe(false);
    }
    expect(isSameItem({ ...source, photos: [back, front] }, source, true)).toBe(false);
    expect(isSameItem({ ...source, photos: [front] }, source, true)).toBe(false);
    expect(isSameItem({ ...source, photos: [new File(["front"], "front.jpg", { type: "image/jpeg" }), back] }, source, true)).toBe(false);
    expect(isSameItem({ ...source, photos: [] }, source, false)).toBe(true);
    expect(canApplyItemPrice(source, source, true)).toBe(true);
    expect(canApplyItemPrice({ ...source, pricing: { ...source.pricing, startingBidCents: "1500" } }, source, true)).toBe(false);
    expect(canApplyItemPrice({ ...source, pricing: { ...source.pricing, listingType: "fixed_price" } }, source, true)).toBe(false);
    expect(canApplyItemPrice({ ...source, facts: { ...source.facts, conditionNote: "Broken" } }, source, true)).toBe(false);
    expect(canApplyItemPrice({ ...source, photos: [back] }, source, true)).toBe(false);
  });
});
