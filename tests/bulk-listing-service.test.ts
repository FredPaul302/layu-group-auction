import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  save: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    savedPhoto: { findMany: vi.fn() },
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
import { applySharedAuctionEnd } from "../src/lib/catalog/bulk-auction-schedule";

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
    vi.resetAllMocks();
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

  const savedPhoto = { id: "saved-1", storageKey: "private-original.jpg", fileName: "item.jpg", contentType: "image/jpeg", sizeBytes: 5 };
  const savedInput = () => ({ sellerUserId: "seller", files: [], savedPhotos: [{ id: "image_1", savedPhotoId: savedPhoto.id }], items: [createAuctionItem({ videoFileIds: [] })] });

  it("copies owned inbox originals to independent listing assets before creating the batch", async () => {
    const tx = createTransactionMocks();
    prismaMock.prisma.$transaction.mockImplementation(async (work) => work(tx));
    prismaMock.prisma.savedPhoto.findMany.mockResolvedValue([savedPhoto]);
    storageMocks.read.mockResolvedValue({ body: Buffer.from("photo") });
    await createDraftListingsFromBulkWorkspace(savedInput());
    expect(prismaMock.prisma.savedPhoto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerUserId: "seller", id: { in: ["saved-1"] } } }));
    expect(storageMocks.read).toHaveBeenCalledWith("private-original.jpg");
    expect(storageMocks.save).toHaveBeenCalledWith({ body: Buffer.from("photo"), contentType: "image/jpeg", fileName: "item.jpg" });
    expect(tx.listingImage.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ storageKey: "stored-image.jpg" })] });
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("rejects missing or other sellers' photos before reading or saving assets", async () => {
    prismaMock.prisma.savedPhoto.findMany.mockResolvedValue([]);
    await expect(createDraftListingsFromBulkWorkspace(savedInput())).rejects.toMatchObject({ code: "bulk_saved_photo_missing" });
    expect(storageMocks.read).not.toHaveBeenCalled();
    expect(storageMocks.save).not.toHaveBeenCalled();
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects reference/upload ID collisions and selecting the same inbox photo twice", async () => {
    await expect(createDraftListingsFromBulkWorkspace({ ...savedInput(), files: [{ id: "image_1", file: new File(["x"], "x.jpg", { type: "image/jpeg" }) }] })).rejects.toMatchObject({ code: "bulk_media_id_invalid" });
    await expect(createDraftListingsFromBulkWorkspace({ ...savedInput(), savedPhotos: [{ id: "a", savedPhotoId: "saved-1" }, { id: "b", savedPhotoId: "saved-1" }] })).rejects.toMatchObject({ code: "bulk_media_id_invalid" });
    expect(prismaMock.prisma.savedPhoto.findMany).not.toHaveBeenCalled();
  });

  it("removes only new listing copies when a saved-photo batch rolls back", async () => {
    prismaMock.prisma.savedPhoto.findMany.mockResolvedValue([savedPhoto]);
    storageMocks.read.mockResolvedValue({ body: Buffer.from("photo") });
    prismaMock.prisma.$transaction.mockRejectedValue(new Error("db failed"));
    await expect(createDraftListingsFromBulkWorkspace(savedInput())).rejects.toThrow("db failed");
    expect(storageMocks.remove).toHaveBeenCalledExactlyOnceWith("stored-image.jpg");
    expect(storageMocks.remove).not.toHaveBeenCalledWith("private-original.jpg");
  });

  it("rejects changed or unreadable originals without creating listings", async () => {
    prismaMock.prisma.savedPhoto.findMany.mockResolvedValue([savedPhoto]);
    storageMocks.read.mockResolvedValue({ body: Buffer.from("shorter than expected") });
    await expect(createDraftListingsFromBulkWorkspace(savedInput())).rejects.toMatchObject({ code: "bulk_saved_photo_changed" });
    expect(storageMocks.save).not.toHaveBeenCalled();
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("publishes a bulk batch immediately when explicitly requested", async () => {
    const tx = createTransactionMocks();
    prismaMock.prisma.$transaction.mockImplementation(async (work) => work(tx));
    const now = new Date("2026-09-16T12:00:00Z");
    await createDraftListingsFromBulkWorkspace({ saveAs: "published", files: [{ id: "image_1", file: new File(["photo"], "item.jpg", { type: "image/jpeg" }) }],
      items: [createAuctionItem({ videoFileIds: [], endAtUtc: "2099-09-26T12:00:00Z" })], sellerUserId: "seller", now });
    expect(tx.listing.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "published", publishedAtUtc: now }) }));
    expect(tx.auction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startAtUtc: now, endAtUtc: new Date("2099-09-26T12:00:00Z") }) }));
  });

  it("rejects expired auctions before saving uploads for immediate publication", async () => {
    await expect(createDraftListingsFromBulkWorkspace({ saveAs: "published", files: [{ id: "image_1", file: new File(["photo"], "item.jpg", { type: "image/jpeg" }) }],
      items: [createAuctionItem({ videoFileIds: [], endAtUtc: "2000-01-01T12:00:00Z" })], sellerUserId: "seller" })).rejects.toMatchObject({ code: "bulk_validation_failed" });
    expect(storageMocks.save).not.toHaveBeenCalled();
  });

  it("cleans up photos and creates nothing if the auction expires during upload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2030-05-01T17:59:00Z"));
      const tx = createTransactionMocks();
      prismaMock.prisma.$transaction.mockImplementation(async (work) => work(tx));
      storageMocks.save.mockReset().mockImplementation(async () => {
        vi.setSystemTime(new Date("2030-05-01T18:01:00Z"));
        return { contentType: "image/jpeg", fileName: "item.jpg", key: "expired-photo.jpg", sizeBytes: 5 };
      });

      await expect(createDraftListingsFromBulkWorkspace({
        saveAs: "published",
        files: [{ id: "image_1", file: new File(["photo"], "item.jpg", { type: "image/jpeg" }) }],
        items: [createAuctionItem({ videoFileIds: [], endAtUtc: "2030-05-01T18:00:00Z" })],
        sellerUserId: "seller"
      })).rejects.toMatchObject({ code: "end_at_utc_invalid" });

      expect(tx.listing.create).not.toHaveBeenCalled();
      expect(storageMocks.remove).toHaveBeenCalledWith("expired-photo.jpg");
    } finally {
      vi.useRealTimers();
    }
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

  it("stores one absolute UTC ending and the reviewed condition across a bulk auction", async () => {
    const transaction = createTransactionMocks();
    transaction.listing.create.mockResolvedValueOnce({ id: "listing-one" }).mockResolvedValueOnce({ id: "listing-two" });
    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<string[]>) => callback(transaction));
    const endAtUtc = "2030-09-25T22:30:00.000Z";
    const rows = ["one", "two"].map((id) => createAuctionItem({ clientId: id, sku: `SKU-${id}`, title: `Item ${id}`, imageFileIds: [], imageOrder: [], primaryImageFileId: null, videoFileIds: [], condition: "Estimated visual condition: scuffs; working condition not confirmed." }));
    await createDraftListingsFromBulkWorkspace({ allowIncompleteDraftRows: true, files: [], items: applySharedAuctionEnd(rows, true, endAtUtc), sellerUserId: "admin_1", now: new Date("2030-09-15T22:30:00Z") });
    expect(transaction.auction.create).toHaveBeenCalledTimes(2);
    for (const [call] of transaction.auction.create.mock.calls) expect(call.data.endAtUtc.toISOString()).toBe(endAtUtc);
    for (const [call] of transaction.listing.create.mock.calls) expect(call.data).toMatchObject({ conditionNote: rows[0].condition, status: "draft", sellerUserId: "admin_1" });
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

  it("reserves explicit numbers first while returning listings in the user's row order", async () => {
    const transaction = createTransactionMocks();
    transaction.listing.create.mockResolvedValueOnce({ id: "manual_listing" }).mockResolvedValueOnce({ id: "auto_listing" });
    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction));
    const item = createAuctionItem({ imageFileIds: [], imageOrder: [], primaryImageFileId: null, videoFileIds: [] });
    const result = await createDraftListingsFromBulkWorkspace({
      files: [], allowIncompleteDraftRows: true, sellerUserId: "admin_1",
      items: [{ ...item, clientId: "automatic", sku: "" }, { ...item, clientId: "manual", sku: "1" }]
    });
    expect(transaction.listing.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ sku: "000001" }) }));
    expect(transaction.listing.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ sku: null }) }));
    expect(result.listingIds).toEqual(["auto_listing", "manual_listing"]);
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
