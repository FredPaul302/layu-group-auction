import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn(),
  requireAdminUser: vi.fn()
}));

const auctionMocks = vi.hoisted(() => ({
  createRunnerUpOfferFromOrder: vi.fn(),
  respondToRunnerUpOffer: vi.fn()
}));

const catalogMocks = vi.hoisted(() => ({
  closeListingNow: vi.fn()
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
    OrderActionError: MockOrderActionError
  };
});

const paymentMocks = vi.hoisted(() => ({
  reviewPaymentSubmission: vi.fn()
}));

const verificationServiceMocks = vi.hoisted(() => ({
  createDepositDraft: vi.fn(),
  submitDepositForReview: vi.fn()
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/auctions", () => auctionMocks);
vi.mock("@/lib/catalog/service", () => catalogMocks);
vi.mock("@/lib/orders", () => orderMocks);
vi.mock("@/lib/payments", () => paymentMocks);
vi.mock("@/lib/verification/service", () => verificationServiceMocks);

import { POST as closeListingPost } from "../src/app/api/admin/listings/[listingId]/close/route.js";
import { POST as createRunnerUpOfferPost } from "../src/app/api/admin/listings/[listingId]/runner-up-offer/route.js";
import { POST as respondToRunnerUpOfferPost } from "../src/app/api/offers/[offerId]/respond/route.js";
import { POST as reviewPaymentPost } from "../src/app/api/payments/[paymentId]/review/route.js";
import { POST as submitDepositPost } from "../src/app/api/verifications/deposit/route.js";

const sameOriginHeaders = {
  Origin: "http://localhost:3000"
};

const adminUser = {
  id: "admin_1",
  role: "admin",
  emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
};

const buyerUser = {
  id: "buyer_1",
  role: "bidder",
  emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
};

describe("admin and buyer workflow route happy paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an admin close a listing from the admin route", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(adminUser);

    const response = await closeListingPost(
      new NextRequest("http://localhost/api/admin/listings/listing_1/close", {
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
      "http://localhost/admin/listings/listing_1?status=listing_closed"
    );
    expect(catalogMocks.closeListingNow).toHaveBeenCalledWith("listing_1");
  });

  it("lets an admin create a runner-up offer from a listing", async () => {
    authMocks.requireAdminUser.mockResolvedValue(adminUser);

    const formData = new FormData();
    formData.set("orderId", "order_1");
    formData.set("notes", "Offer the next bidder a chance to buy.");

    const response = await createRunnerUpOfferPost(
      new NextRequest("http://localhost/api/admin/listings/listing_1/runner-up-offer", {
        body: formData,
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
      "http://localhost/admin/offers?status=runner_up_offered"
    );
    expect(auctionMocks.createRunnerUpOfferFromOrder).toHaveBeenCalledWith({
      listingId: "listing_1",
      orderId: "order_1",
      offeredByUserId: "admin_1",
      notes: "Offer the next bidder a chance to buy."
    });
  });

  it.each([
    ["approve", "payment_confirmed"],
    ["reject", "payment_rejected"]
  ])(
    "lets an admin %s a payment review submission",
    async (decision, status) => {
      authMocks.requireAdminUser.mockResolvedValue(adminUser);

      const formData = new FormData();
      formData.set("decision", decision);
      formData.set("reviewNotes", "Reviewed by operations.");

      const response = await reviewPaymentPost(
        new NextRequest("http://localhost/api/payments/pay_1/review", {
          body: formData,
          headers: sameOriginHeaders,
          method: "POST"
        }),
        {
          params: Promise.resolve({
            paymentId: "pay_1"
          })
        }
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `http://localhost/admin/payments/pay_1?status=${status}`
      );
      expect(paymentMocks.reviewPaymentSubmission).toHaveBeenCalledWith({
        paymentId: "pay_1",
        reviewedByUserId: "admin_1",
        decision,
        reviewNotes: "Reviewed by operations."
      });
    }
  );

  it("lets an authenticated email-verified buyer submit a deposit proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(buyerUser);

    const proofFile = new File(["sample-proof-bytes"], "deposit-proof.jpg", {
      type: "image/jpeg"
    });
    const formData = new FormData();
    formData.set("action", "submit");
    formData.set("depositId", "dep_1");
    formData.set("payerHandle", "@buyer");
    formData.set("externalReference", "TEST-REF-123");
    formData.set("screenshot", proofFile);

    const response = await submitDepositPost(
      new NextRequest("http://localhost/api/verifications/deposit", {
        body: formData,
        headers: sameOriginHeaders,
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/verification/deposit?status=submitted"
    );
    expect(verificationServiceMocks.submitDepositForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        depositId: "dep_1",
        userId: "buyer_1",
        payerHandle: "@buyer",
        externalReference: "TEST-REF-123",
        screenshotFile: expect.any(File)
      })
    );
    const submittedInput =
      verificationServiceMocks.submitDepositForReview.mock.calls[0]?.[0];

    expect(submittedInput.screenshotFile.name).toBe("deposit-proof.jpg");
    expect(submittedInput.screenshotFile.type).toBe("image/jpeg");
    expect(verificationServiceMocks.createDepositDraft).not.toHaveBeenCalled();
  });

  it("lets a buyer accept a runner-up offer and continue to payment", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(buyerUser);
    auctionMocks.respondToRunnerUpOffer.mockResolvedValue({
      order: {
        id: "order_1"
      }
    });

    const formData = new FormData();
    formData.set("decision", "accept");

    const response = await respondToRunnerUpOfferPost(
      new NextRequest("http://localhost/api/offers/offer_1/respond", {
        body: formData,
        headers: sameOriginHeaders,
        method: "POST"
      }),
      {
        params: Promise.resolve({
          offerId: "offer_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/orders/order_1/payment?status=runner_up_accepted"
    );
    expect(auctionMocks.respondToRunnerUpOffer).toHaveBeenCalledWith({
      offerId: "offer_1",
      userId: "buyer_1",
      decision: "accept"
    });
  });

  it("lets a buyer decline a runner-up offer", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(buyerUser);
    auctionMocks.respondToRunnerUpOffer.mockResolvedValue({
      order: null
    });

    const formData = new FormData();
    formData.set("decision", "decline");

    const response = await respondToRunnerUpOfferPost(
      new NextRequest("http://localhost/api/offers/offer_1/respond", {
        body: formData,
        headers: sameOriginHeaders,
        method: "POST"
      }),
      {
        params: Promise.resolve({
          offerId: "offer_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/offers?status=runner_up_declined"
    );
    expect(auctionMocks.respondToRunnerUpOffer).toHaveBeenCalledWith({
      offerId: "offer_1",
      userId: "buyer_1",
      decision: "decline"
    });
  });
});
