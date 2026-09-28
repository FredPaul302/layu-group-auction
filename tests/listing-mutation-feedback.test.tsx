import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRequestUser: vi.fn(),
  getAppEnv: vi.fn(),
  relistListing: vi.fn(),
  publishListing: vi.fn(),
  getListingEditorData: vi.fn(),
  getListingEditorOptions: vi.fn(),
  readStatusQueryParam: (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? null
}));

vi.mock("@/app/api/_utils/require-admin-request-user", () => ({ requireAdminRequestUser: mocks.requireAdminRequestUser }));
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: mocks.getAppEnv }));
vi.mock("@/lib/catalog/relist", () => ({ relistListing: mocks.relistListing }));
vi.mock("@/lib/catalog/service", () => mocks);
vi.mock("@/lib/catalog/actions", () => ({ archiveListingAction: vi.fn(), removeListingImageAction: vi.fn(), updateListingAction: vi.fn(), updateListingImagesAction: vi.fn() }));
vi.mock("@/lib/auctions", () => ({ getCurrentAuctionPriceCents: vi.fn() }));
vi.mock("@/components/admin/listing-form", () => ({ ListingForm: () => null }));
vi.mock("@/components/admin/listing-image-manager", () => ({ ListingImageManager: () => null }));

import { CatalogValidationError } from "../src/lib/catalog/index.js";
import { POST as duplicate } from "../src/app/api/admin/listings/[listingId]/duplicate/route.js";
import { POST as relist } from "../src/app/api/admin/listings/[listingId]/relist/route.js";
import { POST as publish } from "../src/app/api/admin/listings/[listingId]/publish/route.js";
import DetailPage from "../src/app/(admin)/admin/listings/[listingId]/page.js";
import EditPage from "../src/app/(admin)/admin/listings/[listingId]/edit/page.js";

function request(action: string, origin = "https://market.example") {
  return new NextRequest(`https://market.example/api/admin/listings/listing-1/${action}`, {
    method: "POST", headers: { Origin: origin }, body: new FormData()
  });
}

describe("listing mutation error feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminRequestUser.mockResolvedValue({ user: { id: "admin-1" }, response: null });
    mocks.getAppEnv.mockReturnValue({ app: { url: "https://market.example" } });
    mocks.getListingEditorOptions.mockResolvedValue({ categories: [], pickupEvents: [] });
    mocks.getListingEditorData.mockResolvedValue({
      id: "listing-1", title: "Table", status: "draft", listingType: "fixed_price", category: { name: "Furniture" },
      fulfillmentMode: "pickup_only", fixedPriceCents: 2500, orders: [], images: [], videos: [], auction: null
    });
  });

  it.each([
    { action: "duplicate", handler: duplicate },
    { action: "relist", handler: relist }
  ])("redirects blocked $action operations to actionable listing feedback", async ({ action, handler }) => {
    mocks.relistListing.mockRejectedValue(new CatalogValidationError("inventory_linked_listing", "Release unused stock first"));
    const response = await handler(request(action), { params: Promise.resolve({ listingId: "listing-1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://market.example/admin/listings/listing-1?error=inventory_linked_listing");
  });

  it("redirects blocked publish operations to the editor", async () => {
    mocks.publishListing.mockRejectedValue(new CatalogValidationError("inventory_listing_committed", "Already sold"));
    const response = await publish(request("publish"), { params: Promise.resolve({ listingId: "listing-1" }) });
    expect(response.headers.get("Location")).toBe("https://market.example/admin/listings/listing-1/edit?error=inventory_listing_committed");
  });

  it.each([
    { action: "duplicate", handler: duplicate },
    { action: "relist", handler: relist },
    { action: "publish", handler: publish }
  ])("keeps unknown $action errors out of URLs and checks origin first", async ({ action, handler }) => {
    mocks.relistListing.mockRejectedValue(new Error("private database details"));
    mocks.publishListing.mockRejectedValue(new Error("private database details"));
    const response = await handler(request(action), { params: Promise.resolve({ listingId: "listing-1" }) });
    expect(response.headers.get("Location")).toContain("error=unexpected");
    expect(response.headers.get("Location")).not.toContain("private");
    const blocked = await handler(request(action, "https://other.example"), { params: Promise.resolve({ listingId: "listing-1" }) });
    expect(blocked.status).toBe(403);
    expect(mocks.requireAdminRequestUser).toHaveBeenCalledTimes(1);
  });

  it.each([DetailPage, EditPage])("shows the inventory resolution on both listing pages", async (page) => {
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ listingId: "listing-1" }), searchParams: Promise.resolve({ error: "inventory_linked_listing" }) }));
    expect(html).toContain("Release unused stock from the listing in Inventory");
    expect(html).not.toContain("Listing could not be saved (inventory linked listing)");
  });
});
