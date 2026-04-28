import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const orderMocks = vi.hoisted(() => {
  class MockOrderActionError extends Error {
    code: string;
    statusCode: number;

    constructor(code: string, statusCode: number, message: string) {
      super(message);
      this.name = "OrderActionError";
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  return {
    claimFixedPriceListing: vi.fn(),
    OrderActionError: MockOrderActionError
  };
});

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/orders", () => orderMocks);

import { POST } from "../src/app/api/listings/[listingId]/claim/route.js";

describe("fixed-price claim route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects foreign-origin claim attempts before auth or service work", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/listings/listing_1/claim", {
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
    expect(orderMocks.claimFixedPriceListing).not.toHaveBeenCalled();
  });

  it("redirects a successful fixed-price claim to the buyer payment page", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "buyer_1",
      role: "bidder",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });
    orderMocks.claimFixedPriceListing.mockResolvedValue({
      id: "order_1"
    });

    const response = await POST(
      new NextRequest("http://localhost/api/listings/listing_1/claim", {
        headers: {
          Origin: "http://localhost:3000"
        },
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
      "http://localhost/account/orders/order_1/payment?status=claim_created"
    );
    expect(orderMocks.claimFixedPriceListing).toHaveBeenCalledWith({
      listingId: "listing_1",
      buyerUserId: "buyer_1"
    });
  });
});
