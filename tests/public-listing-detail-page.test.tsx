import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn()
}));

const catalogMocks = vi.hoisted(() => ({
  getPublicListingById: vi.fn(),
  readStatusQueryParam: vi.fn((value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] ?? null : value ?? null
  )
}));

const auctionMocks = vi.hoisted(() => ({
  getAuctionBidGate: vi.fn(() => ({
    canBid: false,
    reason: "authentication_required"
  })),
  getCurrentAuctionPriceCents: vi.fn(() => 12500),
  getNextMinimumBidCents: vi.fn(() => 13000)
}));

const orderMocks = vi.hoisted(() => ({
  getFixedPricePayFirstGate: vi.fn(() => ({
    canStartCheckout: false,
    reason: "authentication_required"
  }))
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/catalog/service", () => catalogMocks);
vi.mock("@/lib/auctions", () => auctionMocks);
vi.mock("@/lib/orders", () => orderMocks);

import ListingDetailPage from "../src/app/(public)/listings/[listingId]/page.js";

function createListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing_1",
    title: "Custom fight stick",
    description: "Tournament-ready stick.",
    conditionNote: null,
    listingType: "fixed_price",
    status: "published",
    fixedPriceCents: 24900,
    fulfillmentMode: "pickup_or_shipping",
    shippingFeeCents: 1500,
    shippingNotes: "Ships in a single carton.",
    createdAtUtc: new Date("2026-04-20T12:00:00.000Z"),
    updatedAtUtc: new Date("2026-04-20T12:00:00.000Z"),
    publishedAtUtc: new Date("2026-04-20T12:00:00.000Z"),
    archivedAtUtc: null,
    sellerUserId: "seller_1",
    categoryId: "cat_1",
    pickupEventId: null,
    slug: "custom-fight-stick",
    category: {
      id: "cat_1",
      name: "Arcade",
      slug: "arcade",
      description: null,
      requiredBidTier: "tier_10",
      minimumBidIncrementCents: 500,
      minimumStartBidCents: 1000,
      isEnabled: true,
      createdAtUtc: new Date("2026-04-20T12:00:00.000Z"),
      updatedAtUtc: new Date("2026-04-20T12:00:00.000Z")
    },
    pickupEvent: null,
    auction: null,
    images: [],
    videos: [],
    ...overrides
  };
}

describe("public listing detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getCurrentUser.mockResolvedValue(null);
  });

  it("renders gallery images using public URLs without exposing storage keys", async () => {
    catalogMocks.getPublicListingById.mockResolvedValue(
      createListing({
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
          },
          {
            id: "image_2",
            listingId: "listing_1",
            storageKey: "private-gallery-key",
            publicUrl: "/uploads/fight-stick-side.jpg",
            altText: "Fight stick side",
            sortOrder: 1,
            isPrimary: false,
            createdAtUtc: new Date("2026-04-20T12:00:00.000Z")
          }
        ]
      })
    );

    const html = renderToStaticMarkup(
      await ListingDetailPage({
        params: Promise.resolve({ listingId: "listing_1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("/uploads/fight-stick-cover.jpg");
    expect(html).toContain("/uploads/fight-stick-side.jpg");
    expect(html).not.toContain("private-storage-key");
    expect(html).not.toContain("private-gallery-key");
  });

  it("renders listing videos through the controlled asset route", async () => {
    catalogMocks.getPublicListingById.mockResolvedValue(
      createListing({
        videos: [
          {
            id: "video_1",
            listingId: "listing_1",
            storageKey: "private-video-key.mp4",
            publicUrl: null,
            contentType: "video/mp4",
            fileName: "demo.mp4",
            sizeBytes: 2048,
            sortOrder: 0,
            createdAtUtc: new Date("2026-04-20T12:00:00.000Z")
          }
        ]
      })
    );

    const html = renderToStaticMarkup(
      await ListingDetailPage({
        params: Promise.resolve({ listingId: "listing_1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("preload=\"metadata\"");
    expect(html).toContain("/uploads/private-video-key.mp4");
  });

  it("renders a placeholder when the listing has no images", async () => {
    catalogMocks.getPublicListingById.mockResolvedValue(createListing());

    const html = renderToStaticMarkup(
      await ListingDetailPage({
        params: Promise.resolve({ listingId: "listing_1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Image pending");
  });
});
