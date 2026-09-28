import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {
  listing: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  category: { findUniqueOrThrow: vi.fn() },
  listingImage: { count: vi.fn() },
  auction: { update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn()
} }));

vi.mock("@/lib/prisma", () => mocks);
vi.mock("@/lib/storage", () => ({ getStorageAdapter: vi.fn() }));
vi.mock("@/lib/auctions", () => ({ closeExpiredAuctions: vi.fn() }));

import { publishListing, updateListingFromFormData } from "../src/lib/catalog/service.js";

function formData(saveAs = "published") {
  const data = new FormData();
  Object.entries({
    title: "Table", categoryId: "category-1", listingType: "fixed_price",
    fulfillmentMode: "pickup_only", shippingFeeCents: "0", fixedPriceCents: "2500", saveAs
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

const source = {
  id: "listing-1", status: "draft", listingType: "fixed_price", publishedAtUtc: null,
  inventoryAllocation: { id: "allocation-1" }, auction: null
};

describe("inventory listing lifecycle protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (work) => work(mocks.prisma));
    mocks.prisma.listing.findUniqueOrThrow.mockResolvedValue(source);
    mocks.prisma.listing.findFirst.mockResolvedValue(null);
    mocks.prisma.listing.update.mockImplementation(async ({ data }) => ({ ...source, ...data }));
    mocks.prisma.category.findUniqueOrThrow.mockResolvedValue({ id: "category-1", minimumStartBidCents: 100, minimumBidIncrementCents: 100 });
    mocks.prisma.listingImage.count.mockResolvedValue(0);
  });

  it.each(["paid", "ready_for_fulfillment", "fulfilled", "sold_pending_payment", "archived"])("cannot reset a linked %s listing through editor save", async (status) => {
    mocks.prisma.listing.findUniqueOrThrow.mockResolvedValue({ ...source, status });
    await expect(updateListingFromFormData({ listingId: source.id, formData: formData() })).rejects.toMatchObject({ code: "inventory_listing_committed" });
    expect(mocks.prisma.listing.update).not.toHaveBeenCalled();
    expect(mocks.prisma.auction.update).not.toHaveBeenCalled();
    expect(mocks.prisma.auction.delete).not.toHaveBeenCalled();
  });

  it.each(["paid", "ready_for_fulfillment", "fulfilled", "sold_pending_payment", "archived"])("cannot republish a linked %s listing through publish controls", async (status) => {
    mocks.prisma.listing.findUniqueOrThrow.mockResolvedValue({ ...source, status });
    await expect(publishListing(source.id)).rejects.toMatchObject({ code: "inventory_listing_committed" });
    expect(mocks.prisma.listing.update).not.toHaveBeenCalled();
  });

  it("allows an unused linked draft to be edited and published", async () => {
    const updated = await updateListingFromFormData({ listingId: source.id, formData: formData() });
    expect(updated.status).toBe("published");
    const published = await publishListing(source.id);
    expect(published.status).toBe("published");
  });

  it.each(["edit", "publish"])("does not overwrite a concurrent reservation/payment or mutate its auction after a stale %s write", async (action) => {
    mocks.prisma.listing.findUniqueOrThrow.mockResolvedValue({ ...source, status: "published", auction: { id: "auction-1", status: "live" } });
    mocks.prisma.listing.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conditional update no longer matches", { code: "P2025", clientVersion: "test" }));

    const operation = action === "edit"
      ? updateListingFromFormData({ listingId: source.id, formData: formData("draft") })
      : publishListing(source.id);
    await expect(operation).rejects.toMatchObject({ code: "inventory_listing_committed" });
    expect(mocks.prisma.listing.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: source.id, status: "published" }) }));
    expect(mocks.prisma.auction.update).not.toHaveBeenCalled();
    expect(mocks.prisma.auction.delete).not.toHaveBeenCalled();
  });

  it("checks payment history and active bids in the write predicate even if an old listing was already reset to draft", async () => {
    await publishListing(source.id);
    const where = mocks.prisma.listing.update.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      { inventoryAllocation: null },
      expect.objectContaining({
        orders: { none: { OR: [
          { paidAtUtc: { not: null } },
          { fulfilledAtUtc: { not: null } },
          { status: { notIn: ["cancelled", "payment_overdue"] } }
        ] } },
        OR: expect.arrayContaining([expect.objectContaining({ auction: { is: {
          bids: { none: { status: { notIn: ["invalid", "withdrawn"] } } },
          runnerUpOffers: { none: { status: { in: ["pending", "accepted"] } } }
        } } })])
      })
    ]));
  });
});
