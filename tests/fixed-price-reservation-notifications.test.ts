import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    siteSetting: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

const notificationMocks = vi.hoisted(() => ({
  sendFixedPriceReservationCreatedNotification: vi.fn(),
  sendOrderCompletedNotification: vi.fn(),
  sendOrderPaidNotification: vi.fn(),
  sendOrderReadyForFulfillmentNotification: vi.fn()
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/notifications/workflow-events", () => notificationMocks);

import { claimFixedPriceListing } from "../src/lib/orders/service.js";

function createTransactionClient(input?: {
  existingOrder?: { id: string } | null;
}) {
  return {
    order: {
      findFirst: vi.fn(async (args: { where: { buyerUserId?: string } }) => {
        if (args.where.buyerUserId) {
          return input?.existingOrder ?? null;
        }

        return null;
      }),
      create: vi.fn(async (args: { data: { paymentDeadlineAtUtc: Date } }) => ({
        id: "order_1",
        paymentDeadlineAtUtc: args.data.paymentDeadlineAtUtc,
        pickupEvent: null,
        listing: {
          category: null,
          pickupEvent: null,
          images: []
        },
        payments: [],
        winningBid: null,
        runnerUpOffer: null
      }))
    },
    listing: {
      findFirst: vi.fn(async () => ({
        id: "listing_1",
        title: "Collector arcade cabinet",
        listingType: "fixed_price",
        status: "published",
        fixedPriceCents: 125_000,
        fulfillmentMode: "pickup_only",
        shippingFeeCents: 0,
        pickupEventId: "pickup_1",
        category: {
          requiredBidTier: "tier_20"
        }
      })),
      updateMany: vi.fn(async () => ({
        count: 1
      }))
    },
    user: {
      findUnique: vi.fn(async () => ({
        id: "buyer_1",
        role: "bidder",
        email: "buyer@example.com",
        emailVerifiedAtUtc: new Date("2026-04-20T00:00:00.000Z"),
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0",
          nonPaymentStrikeCount: 0
        }
      }))
    }
  };
}

describe("fixed-price reservation notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.siteSetting.findUnique.mockResolvedValue({
      defaultWinnerPaymentWindowHours: 48
    });
  });

  it("emails the buyer when a new fixed-price reservation is created", async () => {
    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(createTransactionClient())
    );

    const order = await claimFixedPriceListing({
      listingId: "listing_1",
      buyerUserId: "buyer_1",
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(order.id).toBe("order_1");
    expect(notificationMocks.sendFixedPriceReservationCreatedNotification).toHaveBeenCalledWith({
      orderId: "order_1",
      buyerEmail: "buyer@example.com",
      listingTitle: "Collector arcade cabinet",
      paymentDeadlineAtUtc: new Date("2026-04-26T12:00:00.000Z")
    });
  });

  it("does not resend the reservation email when an active reservation already exists", async () => {
    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(
        createTransactionClient({
          existingOrder: {
            id: "order_existing"
          }
        })
      )
    );

    const order = await claimFixedPriceListing({
      listingId: "listing_1",
      buyerUserId: "buyer_1",
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(order.id).toBe("order_existing");
    expect(notificationMocks.sendFixedPriceReservationCreatedNotification).not.toHaveBeenCalled();
  });
});
