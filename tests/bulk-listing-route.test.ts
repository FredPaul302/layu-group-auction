import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const appEnvMocks = vi.hoisted(() => ({
  getAppEnv: vi.fn()
}));

const adminRequestMocks = vi.hoisted(() => ({
  requireAdminRequestUser: vi.fn()
}));

const bulkServiceMocks = vi.hoisted(() => ({
  createDraftListingsFromBulkWorkspace: vi.fn()
}));

vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/app/api/_utils/require-admin-request-user", () => adminRequestMocks);
vi.mock("@/lib/catalog/bulk-listing-service", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/catalog/bulk-listing-service.js")>(
    "../src/lib/catalog/bulk-listing-service.js"
  );

  return {
    ...actual,
    createDraftListingsFromBulkWorkspace: bulkServiceMocks.createDraftListingsFromBulkWorkspace
  };
});

import { POST } from "../src/app/api/admin/listings/bulk/route.js";

function buildRequest(input: {
  body?: BodyInit;
  contentLength?: string;
  contentType?: string;
  origin?: string;
}) {
  const headers = new Headers();
  headers.set("Origin", input.origin ?? "https://auction.example.com");

  if (input.contentLength) {
    headers.set("Content-Length", input.contentLength);
  }

  if (input.contentType) {
    headers.set("Content-Type", input.contentType);
  }

  return new Request("https://auction.example.com/api/admin/listings/bulk", {
    body: input.body,
    headers,
    method: "POST"
  });
}

describe("bulk listing route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appEnvMocks.getAppEnv.mockReturnValue({
      app: {
        url: "https://auction.example.com"
      }
    });
    adminRequestMocks.requireAdminRequestUser.mockResolvedValue({
      response: null,
      user: {
        id: "admin_1",
        role: "admin"
      }
    });
    bulkServiceMocks.createDraftListingsFromBulkWorkspace.mockResolvedValue({
      listingIds: ["listing_1"],
      warnings: []
    });
  });

  it("rejects cross-origin requests before auth or parsing", async () => {
    const response = await POST(
      buildRequest({
        origin: "https://evil.example"
      }) as never
    );

    expect(response.status).toBe(403);
    expect(adminRequestMocks.requireAdminRequestUser).not.toHaveBeenCalled();
    expect(bulkServiceMocks.createDraftListingsFromBulkWorkspace).not.toHaveBeenCalled();
  });

  it("requires admin authorization before parsing multipart data", async () => {
    adminRequestMocks.requireAdminRequestUser.mockResolvedValue({
      response: NextResponse.redirect("https://auction.example.com/auth/login", {
        status: 303
      }),
      user: null
    });

    const response = await POST(
      buildRequest({
        contentLength: "100",
        contentType: "multipart/form-data; boundary=test"
      }) as never
    );

    expect(response.status).toBe(303);
    expect(bulkServiceMocks.createDraftListingsFromBulkWorkspace).not.toHaveBeenCalled();
  });

  it("rejects oversized requests before multipart parsing", async () => {
    const response = await POST(
      buildRequest({
        contentLength: `${129 * 1024 * 1024}`,
        contentType: "multipart/form-data; boundary=test"
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.status).toBe("bulk_request_too_large");
    expect(bulkServiceMocks.createDraftListingsFromBulkWorkspace).not.toHaveBeenCalled();
  });

  it("passes validated multipart payloads to the draft creation service", async () => {
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        items: [
          {
            categorySlug: "arcade",
            clientId: "item_1",
            description: "Ready.",
            imageFileIds: ["image_1"],
            listingType: "fixed_price",
            priceCents: "4500",
            primaryImageFileId: "image_1",
            sku: "GARAGE-001",
            title: "Garage lot",
            videoFileIds: []
          }
        ]
      })
    );
    formData.append("media:image_1", new File(["image"], "GARAGE-001-1.jpg", { type: "image/jpeg" }));

    const response = await POST(
      new Request("https://auction.example.com/api/admin/listings/bulk", {
        body: formData,
        headers: {
          Origin: "https://auction.example.com"
        },
        method: "POST"
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listingIds).toEqual(["listing_1"]);
    expect(bulkServiceMocks.createDraftListingsFromBulkWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerUserId: "admin_1"
      })
    );
  });
});

