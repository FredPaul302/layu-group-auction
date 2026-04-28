import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const verificationServiceMocks = vi.hoisted(() => ({
  reviewDepositSubmission: vi.fn()
}));

const catalogServiceMocks = vi.hoisted(() => ({
  publishListing: vi.fn()
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/verification/service", () => verificationServiceMocks);
vi.mock("@/lib/catalog/service", () => catalogServiceMocks);

import { POST } from "../src/app/api/verifications/deposit/[verificationId]/review/route.js";
import { POST as publishListingRoute } from "../src/app/api/admin/listings/[listingId]/publish/route.js";

const sameOriginHeaders = {
  Origin: "http://localhost:3000"
};

describe("admin API route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects non-admin users away from deposit review actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "user_1",
      role: "bidder",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const formData = new FormData();
    formData.set("decision", "approve");
    formData.set("reviewNotes", "Looks fine");

    const response = await POST(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/review", {
        headers: sameOriginHeaders,
        method: "POST",
        body: formData
      }),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login");
    expect(verificationServiceMocks.reviewDepositSubmission).not.toHaveBeenCalled();
  });

  it("allows admin users through to deposit review actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const formData = new FormData();
    formData.set("decision", "approve");
    formData.set("reviewNotes", "Looks fine");

    const response = await POST(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/review", {
        headers: sameOriginHeaders,
        method: "POST",
        body: formData
      }),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/deposits?status=deposit_reviewed"
    );
    expect(verificationServiceMocks.reviewDepositSubmission).toHaveBeenCalledWith({
      depositId: "dep_1",
      reviewedByUserId: "admin_1",
      decision: "approve",
      reviewNotes: "Looks fine"
    });
  });

  it("rejects foreign-origin admin listing mutations before auth or service work", async () => {
    const response = await publishListingRoute(
      new NextRequest("http://localhost/api/admin/listings/listing_1/publish", {
        headers: {
          Origin: "https://evil.example"
        },
        method: "POST"
      }),
      {
        params: Promise.resolve({
          listingId: "listing_1"
        })
      }
    );

    expect(response.status).toBe(403);
    expect(authMocks.getCurrentUserFromCookieSource).not.toHaveBeenCalled();
    expect(catalogServiceMocks.publishListing).not.toHaveBeenCalled();
  });

  it("redirects non-admin users away from listing publish actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "user_1",
      role: "bidder",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const response = await publishListingRoute(
      new NextRequest("http://localhost/api/admin/listings/listing_1/publish", {
        headers: sameOriginHeaders,
        method: "POST"
      }),
      {
        params: Promise.resolve({
          listingId: "listing_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/account");
    expect(catalogServiceMocks.publishListing).not.toHaveBeenCalled();
  });

  it("allows admin users through to listing publish actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const response = await publishListingRoute(
      new NextRequest("http://localhost/api/admin/listings/listing_1/publish", {
        headers: sameOriginHeaders,
        method: "POST"
      }),
      {
        params: Promise.resolve({
          listingId: "listing_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/listings/listing_1/edit?status=listing_published"
    );
    expect(catalogServiceMocks.publishListing).toHaveBeenCalledWith("listing_1");
  });
});
