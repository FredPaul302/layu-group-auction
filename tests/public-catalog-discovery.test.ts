import { describe, expect, it } from "vitest";

import {
  filterAndSortPublicListings,
  formatPublicListingStatusLabel,
  getPublicCatalogCounts,
  parsePublicCatalogQuery,
  type PublicCatalogListingLike
} from "../src/lib/catalog/public-discovery.js";

function createListing(overrides: Partial<PublicCatalogListingLike>) {
  return {
    id: "listing_1",
    title: "Arcade marquee",
    description: "Restored arcade art",
    conditionNote: null,
    listingType: "fixed_price" as const,
    status: "published",
    fixedPriceCents: 12000,
    publishedAtUtc: new Date("2026-04-24T10:00:00.000Z"),
    category: {
      name: "Arcade",
      slug: "arcade"
    },
    auction: null,
    ...overrides
  } satisfies PublicCatalogListingLike;
}

describe("public catalog discovery helpers", () => {
  it("parses public query params with stable defaults", () => {
    const query = parsePublicCatalogQuery(
      {
        q: " arcade stick ",
        type: "auction",
        status: "reserved",
        sort: "price_high"
      },
      {
        status: "available",
        sort: "newest"
      }
    );

    expect(query).toEqual({
      q: "arcade stick",
      type: "auction",
      status: "reserved",
      sort: "price_high"
    });
  });

  it("filters by search, status, and type while sorting auctions by ending soon", () => {
    const listings = [
      createListing({
        id: "auction_late",
        title: "Arcade control panel",
        listingType: "auction",
        status: "published",
        fixedPriceCents: null,
        auction: {
          status: "live",
          endAtUtc: new Date("2026-04-28T12:00:00.000Z"),
          startingBidCents: 9000,
          currentHighestBidCents: 11000
        }
      }),
      createListing({
        id: "auction_soon",
        title: "Arcade control board",
        listingType: "auction",
        status: "published",
        fixedPriceCents: null,
        auction: {
          status: "live",
          endAtUtc: new Date("2026-04-25T12:00:00.000Z"),
          startingBidCents: 7000,
          currentHighestBidCents: 8500
        }
      }),
      createListing({
        id: "reserved_fixed",
        title: "Console box",
        status: "sold_pending_payment",
        category: {
          name: "Consoles",
          slug: "consoles"
        }
      })
    ];

    const filtered = filterAndSortPublicListings(listings, {
      q: "arcade",
      type: "auction",
      status: "available",
      sort: "ending_soon"
    });

    expect(filtered.map((listing) => listing.id)).toEqual(["auction_soon", "auction_late"]);
  });

  it("surfaces reserved and sold lifecycle groupings cleanly", () => {
    const listings = [
      createListing({
        id: "reserved_fixed",
        status: "sold_pending_payment",
        title: "Reserved control deck"
      }),
      createListing({
        id: "sold_fixed",
        status: "paid",
        title: "Sold flight yoke"
      }),
      createListing({
        id: "closed_auction",
        listingType: "auction",
        fixedPriceCents: null,
        status: "unsold",
        auction: {
          status: "ended_no_bids",
          endAtUtc: new Date("2026-04-20T12:00:00.000Z"),
          startingBidCents: 5000,
          currentHighestBidCents: null
        }
      })
    ];

    expect(
      filterAndSortPublicListings(listings, {
        q: "",
        type: "all",
        status: "reserved",
        sort: "newest"
      }).map((listing) => formatPublicListingStatusLabel(listing))
    ).toEqual(["Reserved"]);

    expect(getPublicCatalogCounts(listings)).toEqual({
      total: 3,
      auction: 1,
      fixed_price: 2,
      available: 0,
      reserved: 1,
      sold: 1,
      closed: 1
    });
  });
});
