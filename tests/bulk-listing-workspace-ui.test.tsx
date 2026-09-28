import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BulkListingWorkspace, duplicateItem } from "../src/components/admin/bulk-listing-workspace.js";
import type { BulkListingItemInput } from "../src/lib/catalog/bulk-listings";

describe("bulk listing workspace UI", () => {
  it("renders row health counts and the draft creation summary", () => {
    const html = renderToStaticMarkup(
      <BulkListingWorkspace
        categories={[
          {
            id: "cat_1",
            name: "Arcade",
            slug: "arcade",
            requiredBidTier: "tier_1"
          }
        ]}
      />
    );

    expect(html).toContain("Total rows");
    expect(html).toContain("Ready rows");
    expect(html).toContain("Warning rows");
    expect(html).toContain("Blocked rows");
    expect(html).toContain("Save or publish the batch");
    expect(html).toContain("Publish now");
    expect(html).toContain("Upload photos for later");
    expect(html).toContain("Reset workspace");
    expect(html).toContain("AI drafting is currently turned off");
    expect(html).toContain('placeholder="Assigned on import"');
    expect(html).toContain("000001");
  });

  it("offers explicit photo drafting with manual review and no automatic generation", () => {
    const html = renderToStaticMarkup(<BulkListingWorkspace aiEnabled categories={[
      { id: "cat_1", name: "Arcade", slug: "arcade", requiredBidTier: "tier_1" }
    ]} />);
    expect(html).toContain("Describe selected items (0)");
    expect(html).toContain("Describe this item");
    expect(html).toContain("AI context for this sale");
    expect(html).toContain("Analyze only the first (primary) image per listing");
    expect(html).toContain("Each item uses one request");
    expect(html).toContain("Create mode");
    expect(html).toContain("Save your place");
    expect(html).toContain("+ Add new category…");
    expect(html).toContain("AI listing drafts");
    expect(html).toContain("Use one auction end for all items");
    expect(html).toContain('value="10"');
    expect(html).toContain("Shared auction end");
    expect(html).toContain("AI editing instructions");
    expect(html).toContain("Revise description with AI");
    expect(html).toContain("$1.00 tier");
    expect(html).toContain("$20.00 tier is reserved for later");
    expect(html).toContain("Buy It Now price ($)");
    expect(html).toContain("Starting bid ($)");
    expect(html).not.toContain("AI draft preview");
    expect(html).not.toContain("AI drafting is currently turned off");
  });

  it("duplicates listing details without reusing its SKU or media assignments", () => {
    const original: BulkListingItemInput = {
      clientId: "item-original", title: "Ceramic vase", description: "Blue vase", sku: "CUSTOM-42",
      categorySlug: "collectibles", listingType: "fixed_price", priceCents: "2000",
      imageFileIds: ["photo-1"], imageOrder: ["photo-1"], primaryImageFileId: "photo-1", videoFileIds: ["video-1"]
    };
    const duplicate = duplicateItem(original);
    expect(duplicate).toMatchObject({
      title: "Ceramic vase copy", description: "Blue vase", sku: "", categorySlug: "collectibles",
      listingType: "fixed_price", priceCents: "2000", imageFileIds: [], imageOrder: [], primaryImageFileId: null, videoFileIds: []
    });
    expect(duplicate.clientId).not.toBe(original.clientId);
    expect(original.sku).toBe("CUSTOM-42");
    expect(original.imageFileIds).toEqual(["photo-1"]);
  });
});
