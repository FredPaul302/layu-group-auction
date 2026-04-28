import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    listing: {
      updateMany: vi.fn()
    }
  }
}));

const notificationMocks = vi.hoisted(() => ({
  sendFixedPriceReservationReleasedNotification: vi.fn(),
  sendOrderPaymentOverdueNotification: vi.fn()
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/notifications/workflow-events", () => notificationMocks);

import { expireOverdueOrders } from "../src/lib/orders/index.js";

type FakeState = {
  orders: Array<{
    id: string;
    source: "fixed_price_claim" | "fixed_price_pay_first";
    status: string;
    listingId: string;
    paymentDeadlineAtUtc: Date;
    buyerEmail: string;
    listingTitle: string;
  }>;
  listings: Array<{
    id: string;
    status: string;
  }>;
};

function buildState(overrides?: Partial<FakeState>): FakeState {
  return {
    orders: [
      {
        id: "order_1",
        source: "fixed_price_claim",
        status: "payment_submitted",
        listingId: "listing_1",
        paymentDeadlineAtUtc: new Date("2026-04-23T12:00:00.000Z"),
        buyerEmail: "buyer@example.com",
        listingTitle: "Rare fixed-price item"
      }
    ],
    listings: [
      {
        id: "listing_1",
        status: "sold_pending_payment"
      }
    ],
    ...overrides
  };
}

describe("fixed-price reservation expiry", () => {
  let state: FakeState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = buildState();

    prismaMock.prisma.order.findMany.mockImplementation(
      async (args: { where: { status: { in: string[] }; paymentDeadlineAtUtc: { lt: Date } } }) =>
        state.orders
          .filter(
            (order) =>
              args.where.status.in.includes(order.status) &&
              order.paymentDeadlineAtUtc.getTime() < args.where.paymentDeadlineAtUtc.lt.getTime()
          )
          .map((order) => {
            const listing = state.listings.find((candidate) => candidate.id === order.listingId);

            if (!listing) {
              throw new Error(`Missing listing ${order.listingId}`);
            }

            return {
              id: order.id,
              source: order.source,
              status: order.status,
              paymentDeadlineAtUtc: order.paymentDeadlineAtUtc,
              buyerUser: {
                email: order.buyerEmail
              },
              listing: {
                id: listing.id,
                status: listing.status,
                title: order.listingTitle
              }
            };
          })
    );

    prismaMock.prisma.order.updateMany.mockImplementation(
      async (args: {
        where: {
          id: string;
          status: string;
        };
        data: {
          status: string;
        };
      }) => {
        const order = state.orders.find(
          (candidate) =>
            candidate.id === args.where.id && candidate.status === args.where.status
        );

        if (!order) {
          return {
            count: 0
          };
        }

        order.status = args.data.status;

        return {
          count: 1
        };
      }
    );

    prismaMock.prisma.listing.updateMany.mockImplementation(
      async (args: {
        where: {
          id: string;
          status: string;
        };
        data: {
          status: string;
        };
      }) => {
        const listing = state.listings.find(
          (candidate) =>
            candidate.id === args.where.id && candidate.status === args.where.status
        );

        if (!listing) {
          return {
            count: 0
          };
        }

        listing.status = args.data.status;

        return {
          count: 1
        };
      }
    );
  });

  it("releases reserved listings when an unpaid fixed-price order expires", async () => {
    const result = await expireOverdueOrders({
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(result.processedCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.metrics).toEqual({
      paymentOverdueCount: 1,
      releasedReservationCount: 1
    });
    expect(state.orders[0]?.status).toBe("payment_overdue");
    expect(state.listings[0]?.status).toBe("published");
    expect(notificationMocks.sendFixedPriceReservationReleasedNotification).toHaveBeenCalledWith({
      orderId: "order_1",
      buyerEmail: "buyer@example.com",
      listingTitle: "Rare fixed-price item"
    });
    expect(notificationMocks.sendOrderPaymentOverdueNotification).not.toHaveBeenCalled();
  });

  it("is safe to run repeatedly after a reservation has already been released", async () => {
    const firstRun = await expireOverdueOrders({
      now: new Date("2026-04-24T12:00:00.000Z")
    });
    const secondRun = await expireOverdueOrders({
      now: new Date("2026-04-24T12:05:00.000Z")
    });

    expect(firstRun.processedCount).toBe(1);
    expect(secondRun.processedCount).toBe(0);
    expect(secondRun.skippedCount).toBe(0);
    expect(secondRun.errorCount).toBe(0);
    expect(state.orders[0]?.status).toBe("payment_overdue");
    expect(state.listings[0]?.status).toBe("published");
    expect(notificationMocks.sendFixedPriceReservationReleasedNotification).toHaveBeenCalledTimes(1);
  });

  it("does not change listing availability for overdue pay-first orders", async () => {
    state = buildState({
      orders: [
        {
          id: "order_2",
          source: "fixed_price_pay_first",
          status: "payment_submitted",
          listingId: "listing_2",
          paymentDeadlineAtUtc: new Date("2026-04-23T12:00:00.000Z"),
          buyerEmail: "buyer@example.com",
          listingTitle: "Another fixed-price item"
        }
      ],
      listings: [
        {
          id: "listing_2",
          status: "published"
        }
      ]
    });

    const result = await expireOverdueOrders({
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(result.processedCount).toBe(1);
    expect(result.metrics).toEqual({
      paymentOverdueCount: 1,
      releasedReservationCount: 0
    });
    expect(state.orders[0]?.status).toBe("payment_overdue");
    expect(state.listings[0]?.status).toBe("published");
    expect(notificationMocks.sendOrderPaymentOverdueNotification).toHaveBeenCalledWith({
      orderId: "order_2",
      buyerEmail: "buyer@example.com",
      listingTitle: "Another fixed-price item"
    });
    expect(notificationMocks.sendFixedPriceReservationReleasedNotification).not.toHaveBeenCalled();
  });
});
