import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  remove: vi.fn(),
  save: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    category: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => storageMocks)
}));

import {
  BulkListingImportError,
  createDraftListingsFromBulkWorkspace
} from "../src/lib/catalog/bulk-listing-service.js";
import type { BulkListingItemInput } from "../src/lib/catalog/bulk-listings.js";

function createAuctionItem(overrides: Partial<BulkListingItemInput> = {}): BulkListingItemInput {
  return {
    bidIncrementCents: "",
    categorySlug: "arcade",
    clientId: "item_1",
    condition: "Light wear",
    description: "Tournament-ready lot.",
    endAtUtc: "2030-05-01T18:00",
    imageFileIds: ["image_1"],
    imageOrder: ["image_1"],
    listingType: "auction",
    mediaPrefix: "GARAGE-001",
    priceCents: "",
    primaryImageFileId: "image_1",
    quantity: "",
    sku: "GARAGE-001",
    startingBidCents: "2500",
    status: "published",
    title: "Garage arcade lot",
    videoFileIds: ["video_1"],
    ...overrides
  };
}

function createTransactionMocks() {
  return {
    auction: {
      create: vi.fn().mockResolvedValue({
        id: "auction_1"
      })
    },
    listing: {
      create: vi.fn().mockResolvedValue({
        id: "listing_1"
      }),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    listingImage: {
      createMany: vi.fn().mockResolvedValue({
        count: 1
      })
    },
    listingVideo: {
      createMany: vi.fn().mockResolvedValue({
        count: 1
      })
    }
  };
}

describe("bulk listing draft creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.category.findMany.mockResolvedValue([
      {
        id: "cat_1",
        minimumBidIncrementCents: 100,
        minimumStartBidCents: 1000,
        slug: "arcade"
      }
    ]);
    storageMocks.save
      .mockResolvedValueOnce({
        contentType: "image/jpeg",
        fileName: "GARAGE-001-1.jpg",
        key: "stored-image.jpg",
        publicUrl: "https://cdn.example.com/stored-image.jpg",
        sizeBytes: 1024
      })
      .mockResolvedValueOnce({
        contentType: "video/mp4",
        fileName: "GARAGE-001-demo.mp4",
        key: "stored-video.mp4",
        publicUrl: "https://cdn.example.com/stored-video.mp4",
        sizeBytes: 2048
      });
  });

  it("creates draft listings with images and videos without publishing", async () => {
    const transactionMocks = createTransactionMocks();
    prismaMock.prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof transactionMocks) => Promise<string[]>) =>
        callback(transactionMocks)
    );

    const result = await createDraftListingsFromBulkWorkspace({
      files: [
        {
          file: new File(["image"], "GARAGE-001-1.jpg", { type: "image/jpeg" }),
          id: "image_1"
        },
        {
          file: new File(["video"], "GARAGE-001-demo.mp4", { type: "video/mp4" }),
          id: "video_1"
        }
      ],
      items: [createAuctionItem()],
      now: new Date("2026-06-01T12:00:00.000Z"),
      sellerUserId: "admin_1"
    });

    expect(result.listingIds).toEqual(["listing_1"]);
    expect(transactionMocks.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAtUtc: null,
          sellerUserId: "admin_1",
          status: "draft"
        })
      })
    );
    expect(transactionMocks.auction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: "listing_1",
          startAtUtc: new Date("2026-06-01T12:00:00.000Z"),
          status: "live"
        })
      })
    );
    expect(transactionMocks.listingImage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          isPrimary: true,
          listingId: "listing_1",
          publicUrl: "/uploads/stored-image.jpg",
          storageKey: "stored-image.jpg"
        })
      ]
    });
    expect(transactionMocks.listingVideo.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          contentType: "video/mp4",
          fileName: "GARAGE-001-demo.mp4",
          listingId: "listing_1",
          publicUrl: null,
          sizeBytes: 2048,
          storageKey: "stored-video.mp4"
        })
      ]
    });
  });

  it("does not write files or DB rows when hard validation fails", async () => {
    await expect(
      createDraftListingsFromBulkWorkspace({
        files: [],
        items: [
          createAuctionItem({
            imageFileIds: [],
            imageOrder: [],
            primaryImageFileId: null,
            videoFileIds: []
          })
        ],
        sellerUserId: "admin_1"
      })
    ).rejects.toBeInstanceOf(BulkListingImportError);

    expect(prismaMock.prisma.category.findMany).not.toHaveBeenCalled();
    expect(storageMocks.save).not.toHaveBeenCalled();
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cleans up newly stored files when the DB transaction fails", async () => {
    prismaMock.prisma.$transaction.mockRejectedValue(new Error("db failed"));

    await expect(
      createDraftListingsFromBulkWorkspace({
        files: [
          {
            file: new File(["image"], "GARAGE-001-1.jpg", { type: "image/jpeg" }),
            id: "image_1"
          },
          {
            file: new File(["video"], "GARAGE-001-demo.mp4", { type: "video/mp4" }),
            id: "video_1"
          }
        ],
        items: [createAuctionItem()],
        sellerUserId: "admin_1"
      })
    ).rejects.toThrow("db failed");

    expect(storageMocks.remove).toHaveBeenCalledWith("stored-image.jpg");
    expect(storageMocks.remove).toHaveBeenCalledWith("stored-video.mp4");
  });
});

