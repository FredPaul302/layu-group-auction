import { describe, expect, it } from "vitest";

import {
  OrderActionError,
  deserializeShippingAddress,
  formatShippingAddress,
  getFixedPriceClaimGate,
  getFixedPricePayFirstGate,
  getOrderFinancials,
  resolveAdminOrderStatusAction,
  resolveFulfillmentSelection,
  resolveOverdueOrder,
  resolvePaymentReviewTransition,
  resolvePaymentSubmissionStatus
} from "../src/lib/orders/index.js";

describe("fixed-price claim rules", () => {
  const claimSnapshot = {
    listingType: "fixed_price" as const,
    listingStatus: "published" as const,
    fixedPriceCents: 12_500,
    requiredBidTier: "tier_10" as const,
    fulfillmentMode: "shipping_only" as const,
    shippingFeeCents: 1_500
  };

  it("allows eligible verified users to claim fixed-price listings", () => {
    const gate = getFixedPriceClaimGate({
      subject: {
        id: "user_1",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_20",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: claimSnapshot
    });

    expect(gate).toEqual({
      canClaim: true,
      reason: null
    });
  });

  it("rejects blocked or non-paying bidders from claiming", () => {
    const blockedGate = getFixedPriceClaimGate({
      subject: {
        id: "user_2",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: true,
          maxBidTier: "full",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: claimSnapshot
    });
    const nonPayingGate = getFixedPriceClaimGate({
      subject: {
        id: "user_3",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "full",
          nonPaymentStrikeCount: 2
        }
      },
      snapshot: claimSnapshot
    });

    expect(blockedGate.reason).toBe("bidder_blocked");
    expect(nonPayingGate.reason).toBe("bidder_blocked");
  });

  it("treats non-published fixed-price listings as unavailable", () => {
    const gate = getFixedPriceClaimGate({
      subject: {
        id: "user_4",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "full",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: {
        ...claimSnapshot,
        listingStatus: "sold_pending_payment"
      }
    });

    expect(gate).toEqual({
      canClaim: false,
      reason: "listing_unavailable"
    });
  });
});

describe("fixed-price checkout rules", () => {
  const payFirstSnapshot = {
    listingType: "fixed_price" as const,
    listingStatus: "published" as const,
    fixedPriceCents: 12_500,
    requiredBidTier: "tier_20" as const,
    fulfillmentMode: "pickup_or_shipping" as const,
    shippingFeeCents: 1_500
  };

  it("blocks email-unverified users from starting fixed-price checkout", () => {
    const gate = getFixedPricePayFirstGate({
      subject: {
        id: "user_10",
        role: "bidder",
        emailVerifiedAtUtc: null,
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: payFirstSnapshot
    });

    expect(gate).toEqual({
      canStartCheckout: false,
      reason: "email_verification_required"
    });
  });

  it("allows email-verified users without Persona or deposit verification", () => {
    const gate = getFixedPricePayFirstGate({
      subject: {
        id: "user_11",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: payFirstSnapshot
    });

    expect(gate).toEqual({
      canStartCheckout: true,
      reason: null
    });
  });

  it("rejects blocked users from fixed-price checkout", () => {
    const gate = getFixedPricePayFirstGate({
      subject: {
        id: "user_12",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: true,
          maxBidTier: "full",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: payFirstSnapshot
    });

    expect(gate).toEqual({
      canStartCheckout: false,
      reason: "bidder_blocked"
    });
  });

  it("rejects auction listings for fixed-price checkout", () => {
    const gate = getFixedPricePayFirstGate({
      subject: {
        id: "user_13",
        role: "bidder",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "full",
          nonPaymentStrikeCount: 0
        }
      },
      snapshot: {
        ...payFirstSnapshot,
        listingType: "auction"
      }
    });

    expect(gate).toEqual({
      canStartCheckout: false,
      reason: "listing_unavailable"
    });
  });
});

describe("fulfillment selection rules", () => {
  it("keeps shipping flat-fee only for shipping-only orders", () => {
    expect(
      getOrderFinancials({
        subtotalCents: 5_000,
        fulfillmentMode: "shipping_only",
        shippingFeeCents: 750
      })
    ).toMatchObject({
      subtotalCents: 5_000,
      shippingFeeCents: 750,
      totalCents: 5_750,
      selectedFulfillmentMode: "shipping_only"
    });

    expect(
      getOrderFinancials({
        subtotalCents: 5_000,
        fulfillmentMode: "pickup_or_shipping",
        shippingFeeCents: 750
      })
    ).toMatchObject({
      subtotalCents: 5_000,
      shippingFeeCents: 0,
      totalCents: 5_000,
      selectedFulfillmentMode: null
    });
  });

  it("stores normalized shipping details and applies the shipping fee", () => {
    const selection = resolveFulfillmentSelection({
      orderStatus: "awaiting_payment",
      listingFulfillmentMode: "pickup_or_shipping",
      desiredFulfillmentMode: "shipping_only",
      subtotalCents: 8_000,
      listingShippingFeeCents: 1_250,
      pickupEventId: "pickup_1",
      shippingAddress: {
        recipientName: "   Ada Lovelace   ",
        addressLine1: "123 Main St",
        addressLine2: "Suite 5",
        city: "New York",
        stateOrProvince: "NY",
        postalCode: "10001",
        countryCode: "us",
        phoneNumber: "555-0100"
      }
    });

    expect(selection.selectedFulfillmentMode).toBe("shipping_only");
    expect(selection.pickupEventId).toBeNull();
    expect(selection.shippingFeeCents).toBe(1_250);
    expect(selection.totalCents).toBe(9_250);
    expect(deserializeShippingAddress(selection.shippingAddressText)).toMatchObject({
      recipientName: "Ada Lovelace",
      addressLine1: "123 Main St",
      city: "New York",
      stateOrProvince: "NY",
      postalCode: "10001",
      countryCode: "US"
    });
    expect(formatShippingAddress(selection.shippingAddressText)).toContain("Ada Lovelace");
  });

  it("requires a pickup event for pickup fulfillment", () => {
    expect(() =>
      resolveFulfillmentSelection({
        orderStatus: "awaiting_payment",
        listingFulfillmentMode: "pickup_only",
        desiredFulfillmentMode: "pickup_only",
        subtotalCents: 8_000,
        listingShippingFeeCents: 0,
        pickupEventId: null
      })
    ).toThrowError(OrderActionError);
  });

  it("rejects pickup on shipping-only listings", () => {
    expect(() =>
      resolveFulfillmentSelection({
        orderStatus: "awaiting_payment",
        listingFulfillmentMode: "shipping_only",
        desiredFulfillmentMode: "pickup_only",
        subtotalCents: 8_000,
        listingShippingFeeCents: 900,
        pickupEventId: "pickup_1"
      })
    ).toThrowError(/shipping only/i);
  });
});

describe("order and payment transitions", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");

  it("accepts manual payment submissions before the deadline when fulfillment is complete", () => {
    const nextState = resolvePaymentSubmissionStatus({
      orderStatus: "awaiting_payment",
      paymentDeadlineAtUtc: new Date("2026-04-21T12:00:00.000Z"),
      fulfillmentSelectionComplete: true,
      now
    });

    expect(nextState.orderStatus).toBe("payment_submitted");
  });

  it("rejects payment submission when fulfillment is incomplete", () => {
    expect(() =>
      resolvePaymentSubmissionStatus({
        orderStatus: "awaiting_payment",
        paymentDeadlineAtUtc: new Date("2026-04-21T12:00:00.000Z"),
        fulfillmentSelectionComplete: false,
        now
      })
    ).toThrowError(OrderActionError);
  });

  it("rejects payment submissions after the deadline", () => {
    expect(() =>
      resolvePaymentSubmissionStatus({
        orderStatus: "awaiting_payment",
        paymentDeadlineAtUtc: new Date("2026-04-19T12:00:00.000Z"),
        fulfillmentSelectionComplete: true,
        now
      })
    ).toThrowError(OrderActionError);
  });

  it("rejects duplicate payment submissions while one is already pending review", () => {
    expect(() =>
      resolvePaymentSubmissionStatus({
        orderStatus: "payment_submitted",
        paymentDeadlineAtUtc: new Date("2026-04-21T12:00:00.000Z"),
        fulfillmentSelectionComplete: true,
        hasPendingReviewPayment: true,
        now
      })
    ).toThrowError(OrderActionError);
  });

  it("marks approved payment submissions as paid while keeping fulfillment separate", () => {
    const transition = resolvePaymentReviewTransition({
      orderStatus: "payment_submitted",
      paymentStatus: "pending_review",
      decision: "approve",
      now
    });

    expect(transition).toMatchObject({
      paymentStatus: "approved",
      orderStatus: "paid",
      listingStatus: "paid",
      paidAtUtc: now,
      reviewedAtUtc: now
    });
  });

  it("marks rejected payment submissions without clearing the audit trail", () => {
    const transition = resolvePaymentReviewTransition({
      orderStatus: "payment_submitted",
      paymentStatus: "pending_review",
      decision: "reject",
      now
    });

    expect(transition).toMatchObject({
      paymentStatus: "rejected",
      orderStatus: "payment_rejected",
      listingStatus: null,
      paidAtUtc: null,
      reviewedAtUtc: now
    });
  });

  it("expires overdue orders idempotently", () => {
    const overdue = resolveOverdueOrder({
      orderStatus: "payment_submitted",
      paymentDeadlineAtUtc: new Date("2026-04-19T11:59:59.000Z"),
      now
    });
    const alreadyExpired = resolveOverdueOrder({
      orderStatus: "payment_overdue",
      paymentDeadlineAtUtc: new Date("2026-04-19T11:59:59.000Z"),
      now
    });

    expect(overdue).toEqual({
      shouldExpire: true,
      nextStatus: "payment_overdue"
    });
    expect(alreadyExpired).toEqual({
      shouldExpire: false,
      reason: "status_not_expirable"
    });
  });

  it("requires fulfillment completion before ready-for-fulfillment", () => {
    expect(() =>
      resolveAdminOrderStatusAction({
        action: "mark_ready_for_fulfillment",
        orderStatus: "paid",
        fulfillmentSelectionComplete: false,
        now
      })
    ).toThrowError(OrderActionError);
  });

  it("enforces the ready -> fulfilled -> completed sequence", () => {
    const ready = resolveAdminOrderStatusAction({
      action: "mark_ready_for_fulfillment",
      orderStatus: "paid",
      fulfillmentSelectionComplete: true,
      now
    });
    const fulfilled = resolveAdminOrderStatusAction({
      action: "mark_fulfilled",
      orderStatus: "ready_for_fulfillment",
      now
    });
    const completed = resolveAdminOrderStatusAction({
      action: "mark_completed",
      orderStatus: "fulfilled",
      now
    });

    expect(ready).toMatchObject({
      orderStatus: "ready_for_fulfillment",
      listingStatus: "ready_for_fulfillment"
    });
    expect(fulfilled).toMatchObject({
      orderStatus: "fulfilled",
      listingStatus: "fulfilled",
      fulfilledAtUtc: now
    });
    expect(completed).toMatchObject({
      orderStatus: "completed",
      listingStatus: null
    });
  });

  it("prevents invalid direct completion from paid", () => {
    expect(() =>
      resolveAdminOrderStatusAction({
        action: "mark_completed",
        orderStatus: "paid",
        now
      })
    ).toThrowError(OrderActionError);
  });
});
