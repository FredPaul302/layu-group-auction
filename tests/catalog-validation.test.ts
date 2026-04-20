import { describe, expect, it } from "vitest";

import {
  CatalogValidationError,
  hasCategoryTierAssignment,
  validateCategoryInput,
  validateListingInput
} from "../src/lib/catalog/index.js";

describe("catalog category rules", () => {
  it("accepts the supported category deposit tiers", () => {
    expect(hasCategoryTierAssignment("tier_5")).toBe(true);
    expect(hasCategoryTierAssignment("tier_10")).toBe(true);
    expect(hasCategoryTierAssignment("tier_20")).toBe(true);
    expect(hasCategoryTierAssignment("tier_0")).toBe(false);
    expect(hasCategoryTierAssignment("full")).toBe(false);
  });

  it("normalizes a valid category payload", () => {
    const category = validateCategoryInput({
      name: "Premium Cameras",
      slug: "",
      description: "  High-value camera gear.  ",
      minimumStartBidCents: 2000,
      minimumBidIncrementCents: 500,
      requiredBidTier: "tier_20"
    });

    expect(category.slug).toBe("premium-cameras");
    expect(category.description).toBe("High-value camera gear.");
    expect(category.requiredBidTier).toBe("tier_20");
  });
});

describe("catalog listing validation", () => {
  it("accepts a valid published auction listing", () => {
    const listing = validateListingInput({
      title: "Vintage Camera",
      description: "Ready for the catalog.",
      categoryId: "cat_1",
      listingType: "auction",
      conditionNote: "Used",
      fulfillmentMode: "pickup_or_shipping",
      shippingFeeCents: 1500,
      shippingNotes: "Ships in one box.",
      pickupEventId: "pickup_1",
      fixedPriceCents: null,
      startingBidCents: 2500,
      endAtUtc: new Date(Date.now() + 24 * 60 * 60 * 1000),
      saveAs: "published",
      categoryMinimumStartBidCents: 2000,
      categoryMinimumBidIncrementCents: 500
    });

    expect(listing.listingType).toBe("auction");
    expect(listing.startingBidCents).toBe(2500);
    expect(listing.fixedPriceCents).toBeNull();
    expect(listing.pickupEventId).toBe("pickup_1");
  });

  it("rejects pickup-only listings that include shipping fees", () => {
    expect(() =>
      validateListingInput({
        title: "Pickup Only Lot",
        categoryId: "cat_1",
        listingType: "fixed_price",
        fulfillmentMode: "pickup_only",
        shippingFeeCents: 100,
        fixedPriceCents: 5000,
        saveAs: "draft",
        categoryMinimumStartBidCents: 500,
        categoryMinimumBidIncrementCents: 100
      })
    ).toThrowError(CatalogValidationError);
  });

  it("rejects auction-only fields on fixed-price listings", () => {
    expect(() =>
      validateListingInput({
        title: "Immediate Sale",
        categoryId: "cat_1",
        listingType: "fixed_price",
        fulfillmentMode: "shipping_only",
        shippingFeeCents: 1200,
        fixedPriceCents: 4500,
        startingBidCents: 500,
        endAtUtc: new Date(Date.now() + 24 * 60 * 60 * 1000),
        saveAs: "draft",
        categoryMinimumStartBidCents: 500,
        categoryMinimumBidIncrementCents: 100
      })
    ).toThrowError(/auction-only fields/u);
  });

  it("rejects auction listings below the category minimum start bid", () => {
    expect(() =>
      validateListingInput({
        title: "Below Floor Auction",
        categoryId: "cat_1",
        listingType: "auction",
        fulfillmentMode: "shipping_only",
        shippingFeeCents: 500,
        startingBidCents: 900,
        endAtUtc: new Date(Date.now() + 24 * 60 * 60 * 1000),
        saveAs: "published",
        categoryMinimumStartBidCents: 1000,
        categoryMinimumBidIncrementCents: 100
      })
    ).toThrowError(/category minimum/u);
  });
});
