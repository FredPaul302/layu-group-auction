import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: {
    listing: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    listingImage: { createMany: vi.fn() },
    auction: { create: vi.fn() }
  },
  prisma: { $transaction: vi.fn() }
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { relistListing } from "../src/lib/catalog/relist.js";

const source = {
  id: "old-listing",
  sellerUserId: "seller-1",
  categoryId: "category-1",
  pickupEventId: null,
  listingType: "fixed_price",
  status: "unsold",
  title: "Table",
  description: "Scratched top.",
  conditionNote: "Used",
  fixedPriceCents: 2500,
  fulfillmentMode: "pickup_only",
  shippingFeeCents: 0,
  shippingNotes: null,
  inventoryAllocation: null,
  auction: null,
  images: []
};

describe("inventory links during relist and duplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (work) => work(mocks.transaction));
    mocks.transaction.listing.findUniqueOrThrow.mockResolvedValue(source);
    mocks.transaction.listing.findFirst.mockResolvedValue(null);
    mocks.transaction.listing.create.mockImplementation(async ({ data }) => ({ id: "new-listing", ...data }));
    mocks.transaction.listingImage.createMany.mockResolvedValue({ count: 0 });
    mocks.transaction.auction.create.mockResolvedValue({ id: "new-auction" });
  });

  it.each([
    { mode: "same_settings" as const, status: "unsold" },
    { mode: "edit" as const, status: "draft" },
    { mode: "same_settings" as const, status: "paid" },
    { mode: "edit" as const, status: "fulfilled" },
    { mode: "same_settings" as const, status: "published" },
    { mode: "edit" as const, status: "archived" }
  ])("keeps the inventory link intact and blocks cloning linked $status listings with $mode", async ({ mode, status }) => {
    mocks.transaction.listing.findUniqueOrThrow.mockResolvedValue({
      ...source,
      status,
      inventoryAllocation: { id: "allocation-1", inventoryItemId: "item-1", unitCostCents: 1200 }
    });

    await expect(relistListing({ listingId: source.id, mode })).rejects.toMatchObject({
      code: "inventory_linked_listing",
      message: expect.stringContaining("Release unused stock")
    });
    expect(mocks.transaction.listing.create).not.toHaveBeenCalled();
    expect(mocks.transaction.listingImage.createMany).not.toHaveBeenCalled();
    expect(mocks.transaction.auction.create).not.toHaveBeenCalled();
    expect(mocks.transaction.listing.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable"
    });
  });

  it.each([
    { mode: "same_settings" as const, status: "published" },
    { mode: "edit" as const, status: "draft" }
  ])("preserves existing $mode behavior for unlinked listings", async ({ mode, status }) => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const result = await relistListing({ listingId: source.id, mode, now });

    expect(result.status).toBe(status);
    expect(result.description).toBe(source.description);
    expect(result.fixedPriceCents).toBe(2500);
    expect(result.publishedAtUtc).toEqual(status === "published" ? now : null);
    expect(mocks.transaction.listing.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ inventoryAllocation: true })
    }));
    expect(mocks.transaction.listing.create).toHaveBeenCalledTimes(1);
  });

  it("preserves the auction duration and copied photos for an unlinked auction", async () => {
    mocks.transaction.listing.findUniqueOrThrow.mockResolvedValue({
      ...source,
      listingType: "auction",
      auction: {
        startAtUtc: new Date("2026-09-01T12:00:00.000Z"),
        endAtUtc: new Date("2026-09-03T12:00:00.000Z"),
        startingBidCents: 500,
        minimumIncrementCents: 100
      },
      images: [{ storageKey: "photo.jpg", publicUrl: "/photo.jpg", altText: "Table", sortOrder: 0, isPrimary: true }]
    });
    await relistListing({ listingId: source.id, mode: "same_settings", now: new Date("2026-09-13T12:00:00.000Z") });

    expect(mocks.transaction.auction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      listingId: "new-listing",
      startAtUtc: new Date("2026-09-13T12:00:00.000Z"),
      endAtUtc: new Date("2026-09-15T12:00:00.000Z"),
      startingBidCents: 500
    }) });
    expect(mocks.transaction.listingImage.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ listingId: "new-listing", storageKey: "photo.jpg" })] });
  });
});
