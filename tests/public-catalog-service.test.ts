import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    listing: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn()
}));
vi.mock("@/lib/auctions", () => ({
  closeExpiredAuctions: vi.fn()
}));

import { listPublicListings } from "../src/lib/catalog/service.js";

describe("public catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.listing.findMany.mockResolvedValue([]);
  });

  it("queries only public-facing listing data without admin relations", async () => {
    await listPublicListings({
      listingType: "auction",
      categorySlug: "arcade"
    });

    const query = prismaMock.prisma.listing.findMany.mock.calls[0]?.[0];

    expect(query.where).toEqual(
      expect.objectContaining({
        status: {
          notIn: ["draft", "archived"]
        },
        listingType: "auction",
        category: expect.objectContaining({
          isEnabled: true,
          slug: "arcade"
        })
      })
    );
    expect(query.include).toEqual(
      expect.objectContaining({
        category: true,
        pickupEvent: true,
        auction: true,
        images: expect.any(Object),
        videos: expect.any(Object)
      })
    );
    expect("orders" in query.include).toBe(false);
  });
});
