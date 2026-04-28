import { describe, expect, it } from "vitest";

import {
  resolveRunnerUpOfferResponse,
  resolveRunnerUpOfferExpiry,
  selectRunnerUpBid
} from "../src/lib/auctions/index.js";

describe("runner-up offer rules", () => {
  it("selects the highest valid non-winning bid as the runner-up", () => {
    const runnerUpBid = selectRunnerUpBid({
      bids: [
        {
          id: "bid_winner",
          bidderUserId: "user_winner",
          amountCents: 5_000,
          placedAtUtc: new Date("2026-04-20T09:00:00.000Z"),
          status: "winning",
          existingRunnerUpOfferId: null
        },
        {
          id: "bid_runner_up",
          bidderUserId: "user_runner_up",
          amountCents: 4_500,
          placedAtUtc: new Date("2026-04-20T08:00:00.000Z"),
          status: "outbid",
          existingRunnerUpOfferId: null
        },
        {
          id: "bid_lower",
          bidderUserId: "user_other",
          amountCents: 4_000,
          placedAtUtc: new Date("2026-04-20T07:00:00.000Z"),
          status: "outbid",
          existingRunnerUpOfferId: null
        }
      ],
      winningBidId: "bid_winner",
      winningBidderUserId: "user_winner"
    });

    expect(runnerUpBid?.id).toBe("bid_runner_up");
    expect(runnerUpBid?.amountCents).toBe(4_500);
  });

  it("skips bids that already have runner-up offers attached", () => {
    const runnerUpBid = selectRunnerUpBid({
      bids: [
        {
          id: "bid_winner",
          bidderUserId: "user_winner",
          amountCents: 5_000,
          placedAtUtc: new Date("2026-04-20T09:00:00.000Z"),
          status: "winning",
          existingRunnerUpOfferId: null
        },
        {
          id: "bid_used",
          bidderUserId: "user_runner_up",
          amountCents: 4_500,
          placedAtUtc: new Date("2026-04-20T08:00:00.000Z"),
          status: "outbid",
          existingRunnerUpOfferId: "offer_1"
        }
      ],
      winningBidId: "bid_winner",
      winningBidderUserId: "user_winner"
    });

    expect(runnerUpBid).toBeNull();
  });

  it("expires pending offers only once the deadline has passed", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");

    expect(
      resolveRunnerUpOfferExpiry({
        status: "pending",
        expiresAtUtc: new Date("2026-04-21T23:59:59.000Z"),
        now
      })
    ).toEqual({
      shouldExpire: true,
      nextStatus: "expired"
    });

    expect(
      resolveRunnerUpOfferExpiry({
        status: "accepted",
        expiresAtUtc: new Date("2026-04-21T23:59:59.000Z"),
        now
      })
    ).toEqual({
      shouldExpire: false,
      reason: "status_not_pending"
      });
  });

  it("treats repeated accept actions as idempotent when an order already exists", () => {
    expect(
      resolveRunnerUpOfferResponse({
        decision: "accept",
        status: "accepted",
        expiresAtUtc: new Date("2026-04-22T00:00:00.000Z"),
        now: new Date("2026-04-21T00:00:00.000Z"),
        hasExistingOrder: true
      })
    ).toEqual({
      outcome: "already_accepted",
      nextStatus: "accepted"
    });
  });

  it("treats repeated decline actions as idempotent", () => {
    expect(
      resolveRunnerUpOfferResponse({
        decision: "decline",
        status: "declined",
        expiresAtUtc: new Date("2026-04-22T00:00:00.000Z"),
        now: new Date("2026-04-21T00:00:00.000Z"),
        hasExistingOrder: false
      })
    ).toEqual({
      outcome: "already_declined",
      nextStatus: "declined"
    });
  });

  it("marks expired pending offers before any accept or decline is applied", () => {
    expect(
      resolveRunnerUpOfferResponse({
        decision: "accept",
        status: "pending",
        expiresAtUtc: new Date("2026-04-21T00:00:00.000Z"),
        now: new Date("2026-04-21T00:00:01.000Z"),
        hasExistingOrder: false
      })
    ).toEqual({
      outcome: "expired",
      nextStatus: "expired"
    });
  });
});
