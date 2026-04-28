import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    category: {
      findUniqueOrThrow: vi.fn()
    },
    listing: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn()
    },
    listingImage: {
      count: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn()
    },
    auction: {
      create: vi.fn()
    },
    pickupEvent: {
      findUniqueOrThrow: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => storageMocks)
}));
vi.mock("@/lib/auctions", () => ({
  closeExpiredAuctions: vi.fn()
}));

import { CatalogValidationError } from "../src/lib/catalog/index.js";
import {
  createListingsFromFormData,
  removeListingImage,
  updateListingImagesFromFormData
} from "../src/lib/catalog/service.js";

function buildBaseFormData() {
  const formData = new FormData();
  formData.set("title", "Collector Item");
  formData.set("categoryId", "cat_1");
  formData.set("listingType", "fixed_price");
  formData.set("fulfillmentMode", "pickup_only");
  formData.set("shippingFeeCents", "0");
  formData.set("fixedPriceCents", "4500");
  formData.set("saveAs", "draft");

  return formData;
}

describe("listing image management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.category.findUniqueOrThrow.mockResolvedValue({
      id: "cat_1",
      minimumStartBidCents: 1000,
      minimumBidIncrementCents: 100
    });
    prismaMock.prisma.listing.findFirst.mockResolvedValue(null);
    prismaMock.prisma.listing.create.mockResolvedValue({
      id: "listing_1",
      title: "Collector Item"
    });
    prismaMock.prisma.listingImage.count.mockResolvedValue(0);
    prismaMock.prisma.listingImage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.prisma.auction.create.mockResolvedValue({
      id: "auction_1"
    });
    storageMocks.save
      .mockResolvedValueOnce({
        key: "asset-cover",
        publicUrl: "/uploads/cover-image.jpg",
        contentType: "image/jpeg",
        fileName: "cover.jpg",
        sizeBytes: 1024
      })
      .mockResolvedValueOnce({
        key: "asset-gallery",
        publicUrl: "/uploads/gallery-image.jpg",
        contentType: "image/jpeg",
        fileName: "gallery.jpg",
        sizeBytes: 1024
      });
  });

  it("attaches uploaded images when creating a listing", async () => {
    const formData = buildBaseFormData();
    formData.append("images", new File(["cover"], "cover.jpg", { type: "image/jpeg" }));
    formData.append("images", new File(["gallery"], "gallery.jpg", { type: "image/jpeg" }));

    await createListingsFromFormData({
      formData,
      sellerUserId: "admin_1"
    });

    expect(storageMocks.save).toHaveBeenCalledTimes(2);
    expect(prismaMock.prisma.listingImage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          listingId: "listing_1",
          storageKey: "asset-cover",
          publicUrl: "/uploads/cover-image.jpg",
          isPrimary: true,
          sortOrder: 0
        }),
        expect.objectContaining({
          listingId: "listing_1",
          storageKey: "asset-gallery",
          publicUrl: "/uploads/gallery-image.jpg",
          isPrimary: false,
          sortOrder: 1
        })
      ]
    });
  });

  it("rejects invalid image uploads safely", async () => {
    const formData = buildBaseFormData();
    formData.append("images", new File(["not-image"], "notes.txt", { type: "text/plain" }));

    await expect(
      createListingsFromFormData({
        formData,
        sellerUserId: "admin_1"
      })
    ).rejects.toMatchObject({
      code: "listing_image_type_invalid"
    });

    expect(prismaMock.prisma.listingImage.createMany).not.toHaveBeenCalled();
  });

  it("reorders listing images and updates the cover image", async () => {
    prismaMock.prisma.listing.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "listing_1",
        title: "Collector Item",
        images: [
          {
            id: "img_1",
            altText: "First image",
            sortOrder: 0,
            isPrimary: true
          },
          {
            id: "img_2",
            altText: "Second image",
            sortOrder: 1,
            isPrimary: false
          }
        ]
      })
      .mockResolvedValueOnce({
        id: "listing_1",
        title: "Collector Item",
        images: [],
        category: {} as never,
        pickupEvent: null,
        auction: null,
        orders: []
      });
    prismaMock.prisma.listingImage.update.mockImplementation(async (args: unknown) => args);
    prismaMock.prisma.$transaction.mockResolvedValue([]);

    const formData = new FormData();
    formData.set("primaryImageId", "img_2");
    formData.set("altText:img_1", "Back view");
    formData.set("altText:img_2", "Front cover");
    formData.set("sortOrder:img_1", "2");
    formData.set("sortOrder:img_2", "1");

    await updateListingImagesFromFormData({
      listingId: "listing_1",
      formData
    });

    expect(prismaMock.prisma.listingImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img_2" },
        data: expect.objectContaining({
          altText: "Front cover",
          sortOrder: 0,
          isPrimary: true
        })
      })
    );
    expect(prismaMock.prisma.listingImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img_1" },
        data: expect.objectContaining({
          altText: "Back view",
          sortOrder: 1,
          isPrimary: false
        })
      })
    );
  });

  it("removes listing images and cleans up storage while normalizing the remaining gallery", async () => {
    const transactionListingImage = {
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: "img_1",
        storageKey: "asset-cover"
      }),
      delete: vi.fn().mockResolvedValue({ id: "img_1" }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "img_2",
          sortOrder: 1,
          isPrimary: false,
          createdAtUtc: new Date("2026-04-24T10:00:00.000Z")
        }
      ]),
      update: vi.fn().mockResolvedValue({
        id: "img_2"
      })
    };

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: { listingImage: typeof transactionListingImage }) => Promise<string>) =>
      callback({
        listingImage: transactionListingImage
      })
    );
    prismaMock.prisma.listing.findUniqueOrThrow.mockResolvedValue({
      id: "listing_1",
      title: "Collector Item",
      images: [],
      category: {} as never,
      pickupEvent: null,
      auction: null,
      orders: []
    });

    await removeListingImage({
      listingId: "listing_1",
      imageId: "img_1"
    });

    expect(transactionListingImage.delete).toHaveBeenCalledWith({
      where: {
        id: "img_1"
      }
    });
    expect(transactionListingImage.update).toHaveBeenCalledWith({
      where: {
        id: "img_2"
      },
      data: {
        sortOrder: 0,
        isPrimary: true
      }
    });
    expect(storageMocks.remove).toHaveBeenCalledWith("asset-cover");
  });
});
