import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    category: {
      findUniqueOrThrow: vi.fn()
    },
    listing: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    listingImage: {
      count: vi.fn(),
      createMany: vi.fn()
    },
    auction: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    pickupEvent: {
      findUniqueOrThrow: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => ({
    save: vi.fn()
  }))
}));
vi.mock("@/lib/auctions", () => ({
  closeExpiredAuctions: vi.fn()
}));

import {
  createListingsFromFormData,
  publishListing,
  unpublishListing,
  updateListingFromFormData
} from "../src/lib/catalog/service.js";

function buildBaseFormData() {
  const formData = new FormData();
  formData.set("title", "Collector Item");
  formData.set("categoryId", "cat_1");
  formData.set("fulfillmentMode", "pickup_only");
  formData.set("shippingFeeCents", "0");
  formData.set("saveAs", "draft");

  return formData;
}

describe("admin listing operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.category.findUniqueOrThrow.mockResolvedValue({
      id: "cat_1",
      minimumStartBidCents: 1000,
      minimumBidIncrementCents: 100
    });
    prismaMock.prisma.listing.findFirst.mockResolvedValue(null);
    prismaMock.prisma.listing.create.mockImplementation(
      async (args: { data: { title: string; listingType: string; status: string } }) => ({
        id: `listing_${args.data.title.toLowerCase().replaceAll(/\s+/gu, "_")}`,
        ...args.data
      })
    );
    prismaMock.prisma.listingImage.count.mockResolvedValue(0);
    prismaMock.prisma.listingImage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.prisma.auction.create.mockResolvedValue({
      id: "auction_1"
    });
    prismaMock.prisma.auction.update.mockResolvedValue({
      id: "auction_1"
    });
    prismaMock.prisma.auction.delete.mockResolvedValue({
      id: "auction_1"
    });
    prismaMock.prisma.listing.update.mockImplementation(
      async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data
      })
    );
  });

  it("creates a fixed-price listing from the admin form", async () => {
    const formData = buildBaseFormData();
    formData.set("listingType", "fixed_price");
    formData.set("fixedPriceCents", "4500");

    const listings = await createListingsFromFormData({
      formData,
      sellerUserId: "admin_1"
    });

    expect(listings).toHaveLength(1);
    expect(prismaMock.prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingType: "fixed_price",
          fixedPriceCents: 4500,
          status: "draft"
        })
      })
    );
    expect(prismaMock.prisma.auction.create).not.toHaveBeenCalled();
  });

  it("creates multiple fixed-price listings in one batch", async () => {
    const formData = buildBaseFormData();
    formData.set("listingType", "fixed_price");
    formData.set("fixedPriceCents", "4500");
    formData.set("createCount", "3");

    const listings = await createListingsFromFormData({
      formData,
      sellerUserId: "admin_1"
    });

    expect(listings).toHaveLength(3);
    expect(prismaMock.prisma.listing.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.prisma.listing.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Collector Item #1"
        })
      })
    );
    expect(prismaMock.prisma.listing.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Collector Item #3"
        })
      })
    );
  });

  it("creates an auction listing from the admin form", async () => {
    const formData = buildBaseFormData();
    formData.set("title", "Vintage Arcade Flyer");
    formData.set("listingType", "auction");
    formData.set("saveAs", "published");
    formData.set("fulfillmentMode", "shipping_only");
    formData.set("shippingFeeCents", "1200");
    formData.set("startingBidCents", "2500");
    formData.set("endAtUtc", "2030-05-01T18:00");

    await createListingsFromFormData({
      formData,
      sellerUserId: "admin_1"
    });

    expect(prismaMock.prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingType: "auction",
          fixedPriceCents: null,
          status: "published"
        })
      })
    );
    expect(prismaMock.prisma.auction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: expect.any(String),
          startingBidCents: 2500,
          minimumIncrementCents: 100
        })
      })
    );
  });

  it("updates editable listing fields from the admin editor", async () => {
    prismaMock.prisma.listing.findUniqueOrThrow.mockResolvedValue({
      id: "listing_1",
      status: "draft",
      publishedAtUtc: null,
      auction: null
    });

    const formData = buildBaseFormData();
    formData.set("title", "Updated fixed-price title");
    formData.set("categoryId", "cat_2");
    formData.set("listingType", "fixed_price");
    formData.set("fixedPriceCents", "9900");
    formData.set("description", "Updated description");

    await updateListingFromFormData({
      listingId: "listing_1",
      formData
    });

    expect(prismaMock.prisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "listing_1"
        },
        data: expect.objectContaining({
          categoryId: "cat_2",
          title: "Updated fixed-price title",
          fixedPriceCents: 9900,
          description: "Updated description"
        })
      })
    );
  });

  it("publishes and unpublishes listings from admin controls", async () => {
    prismaMock.prisma.$transaction
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) =>
        callback({
          listing: {
            findUniqueOrThrow: vi.fn(async () => ({
              id: "listing_1",
              listingType: "fixed_price",
              status: "draft",
              publishedAtUtc: null,
              auction: null
            })),
            update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
              id: "listing_1",
              ...args.data
            }))
          },
          auction: {
            update: vi.fn()
          }
        })
      )
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) =>
        callback({
          listing: {
            findUniqueOrThrow: vi.fn(async () => ({
              id: "listing_1",
              listingType: "fixed_price",
              status: "published",
              publishedAtUtc: new Date("2026-04-24T12:00:00.000Z")
            })),
            update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
              id: "listing_1",
              ...args.data
            }))
          }
        })
      );

    const published = await publishListing("listing_1", new Date("2026-04-24T12:00:00.000Z"));
    const unpublished = await unpublishListing("listing_1");

    expect(published.status).toBe("published");
    expect(unpublished.status).toBe("draft");
  });
});
