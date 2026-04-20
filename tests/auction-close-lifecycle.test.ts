import { describe, expect, it } from "vitest";

import { resolveExpiredAuction } from "../src/lib/auctions/index.js";

describe("auction close lifecycle", () => {
  it("marks expired auctions with no bids as unsold", () => {
    const resolution = resolveExpiredAuction({
      auctionStatus: "live",
      endAtUtc: new Date("2026-04-19T23:00:00.000Z"),
      listingShippingFeeCents: 0,
      fulfillmentMode: "pickup_only",
      bids: [],
      paymentWindowHours: 48,
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(resolution.shouldClose).toBe(true);
    expect(resolution).toMatchObject({
      outcome: "ended_no_bids",
      auctionStatus: "ended_no_bids",
      listingStatus: "unsold",
      orderDraft: null
    });
  });

  it("creates an awaiting-payment outcome for the winning bidder", () => {
    const resolution = resolveExpiredAuction({
      auctionStatus: "live",
      endAtUtc: new Date("2026-04-19T23:00:00.000Z"),
      listingShippingFeeCents: 1_500,
      fulfillmentMode: "shipping_only",
      bids: [
        {
          id: "bid_1",
          bidderUserId: "user_1",
          amountCents: 4_500,
          placedAtUtc: new Date("2026-04-19T22:00:00.000Z"),
          status: "outbid"
        },
        {
          id: "bid_2",
          bidderUserId: "user_2",
          amountCents: 5_000,
          placedAtUtc: new Date("2026-04-19T22:30:00.000Z"),
          status: "winning"
        }
      ],
      paymentWindowHours: 48,
      now: new Date("2026-04-20T00:00:00.000Z")
    });

    expect(resolution.shouldClose).toBe(true);

    if (!resolution.shouldClose || resolution.outcome !== "awaiting_payment") {
      throw new Error("Expected awaiting-payment resolution.");
    }

    expect(resolution.winningBid.id).toBe("bid_2");
    expect(resolution.orderAlreadyExists).toBe(false);
    expect(resolution.orderDraft).toMatchObject({
      buyerUserId: "user_2",
      subtotalCents: 5_000,
      shippingFeeCents: 1_500,
      totalCents: 6_500,
      selectedFulfillmentMode: "shipping_only"
    });
    expect(resolution.orderDraft?.paymentDeadlineAtUtc.toISOString()).toBe(
      "2026-04-22T00:00:00.000Z"
    );
  });

  it("does not draft a duplicate order when the auction already has a winner order", () => {
    const resolution = resolveExpiredAuction({
      auctionStatus: "live",
      endAtUtc: new Date("2026-04-19T23:00:00.000Z"),
      listingShippingFeeCents: 500,
      fulfillmentMode: "pickup_or_shipping",
      bids: [
        {
          id: "bid_9",
          bidderUserId: "user_9",
          amountCents: 2_000,
          placedAtUtc: new Date("2026-04-19T21:00:00.000Z"),
          status: "winning"
        }
      ],
      paymentWindowHours: 48,
      now: new Date("2026-04-20T00:00:00.000Z"),
      existingAuctionWinOrderId: "order_1"
    });

    expect(resolution.shouldClose).toBe(true);

    if (!resolution.shouldClose || resolution.outcome !== "awaiting_payment") {
      throw new Error("Expected awaiting-payment resolution.");
    }

    expect(resolution.orderAlreadyExists).toBe(true);
    expect(resolution.orderDraft).toBeNull();
  });

  it("skips auctions that are already no longer live", () => {
    const resolution = resolveExpiredAuction({
      auctionStatus: "awaiting_payment",
      endAtUtc: new Date("2026-04-19T23:00:00.000Z"),
      listingShippingFeeCents: 500,
      fulfillmentMode: "pickup_only",
      bids: [
        {
          id: "bid_9",
          bidderUserId: "user_9",
          amountCents: 2_000,
          placedAtUtc: new Date("2026-04-19T21:00:00.000Z"),
          status: "winning"
        }
      ],
      paymentWindowHours: 48,
      now: new Date("2026-04-20T00:00:00.000Z"),
      existingAuctionWinOrderId: "order_1"
    });

    expect(resolution).toEqual({
      shouldClose: false,
      reason: "auction_not_live"
    });
  });
});
