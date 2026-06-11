import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListingCard } from "../src/components/catalog/listing-card.js";

function createListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing_1",
    title: "Custom fight stick",
    description: "Tournament-ready stick.",
    conditionNote: null,
    listingType: "auction",
    status: "published",
    fixedPriceCents: null,
    fulfillmentMode: "pickup_or_shipping",
    shippingFeeCents: 1500,
    shippingNotes: null,
    category: {
      name: "Arcade",
      requiredBidTier: "tier_10",
      slug: "arcade"
    },
    auction: {
      id: "auction_1",
      createdAtUtc: new Date("2026-04-20T12:00:00.000Z"),
      updatedAtUtc: new Date("2026-04-20T12:00:00.000Z"),
      listingId: "listing_1",
      startAtUtc: new Date("2026-04-20T12:00:00.000Z"),
      status: "live",
      endAtUtc: new Date("2026-04-30T12:00:00.000Z"),
      startingBidCents: 10000,
      currentHighestBidCents: 12500,
      currentHighestBidderId: null,
      minimumIncrementCents: 500,
      closedAtUtc: null
    },
    pickupEvent: null,
    images: [],
    videos: [],
  ...overrides
  } as unknown as Parameters<typeof ListingCard>[0]["listing"];
}

describe("public listing card", () => {
  it("renders clear auction type and live status labels", () => {
    const html = renderToStaticMarkup(<ListingCard listing={createListing()} />);

    expect(html).toContain("Auction");
    expect(html).toContain("Live auction");
    expect(html).toContain("Current price");
    expect(html).toContain("Auction end");
  });

  it("renders fixed-price reserved state clearly", () => {
    const html = renderToStaticMarkup(
      <ListingCard
        listing={createListing({
          listingType: "fixed_price",
          status: "sold_pending_payment",
          fixedPriceCents: 24900,
          auction: null
        })}
      />
    );

    expect(html).toContain("Fixed price");
    expect(html).toContain("Reserved");
    expect(html).toContain("Fixed price $249.00");
  });

  it("renders a public image URL without exposing the storage key label", () => {
    const html = renderToStaticMarkup(
      <ListingCard
        listing={createListing({
          images: [
            {
              id: "image_1",
              listingId: "listing_1",
              storageKey: "private-storage-key",
              publicUrl: "/uploads/fight-stick-cover.jpg",
              altText: "Fight stick cover",
              sortOrder: 0,
              isPrimary: true,
              createdAtUtc: new Date("2026-04-20T12:00:00.000Z")
            }
          ]
        })}
      />
    );

    expect(html).toContain("/uploads/fight-stick-cover.jpg");
    expect(html).not.toContain("private-storage-key");
  });

  it("renders a placeholder when no image exists", () => {
    const html = renderToStaticMarkup(<ListingCard listing={createListing()} />);

    expect(html).toContain("Image pending");
  });

  it("renders media badges for video-heavy listings", () => {
    const html = renderToStaticMarkup(
      <ListingCard
        listing={createListing({
          images: [],
          videos: [
            {
              id: "video_1",
              listingId: "listing_1",
              storageKey: "demo.mp4",
              publicUrl: null,
              contentType: "video/mp4",
              fileName: "demo.mp4",
              sizeBytes: 2048,
              sortOrder: 0,
              createdAtUtc: new Date("2026-04-20T12:00:00.000Z")
            }
          ]
        })}
      />
    );

    expect(html).toContain("Video available");
    expect(html).toContain("Open listing to play");
    expect(html).toContain("1 video");
  });
});
