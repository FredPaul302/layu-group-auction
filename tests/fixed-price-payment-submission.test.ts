import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    sitePaymentMethod: {
      findFirst: vi.fn()
    },
    user: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

const notificationMocks = vi.hoisted(() => ({
  sendAdminPaymentSubmittedNotification: vi.fn(),
  sendOrderPaidNotification: vi.fn(),
  sendPaymentRejectedNotification: vi.fn(),
  sendPaymentSubmittedForReviewNotification: vi.fn()
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/notifications/workflow-events", () => notificationMocks);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => ({
    save: vi.fn(),
    remove: vi.fn()
  })),
  getStoredAssetPublicUrl: vi.fn(() => null)
}));

import { OrderActionError } from "../src/lib/orders/index.js";
import { submitOrderPayment } from "../src/lib/payments/service.js";

type FakeState = {
  users: Array<{
    id: string;
    emailVerifiedAtUtc: string | null;
    bidderProfile: {
      isBlocked: boolean;
      maxBidTier: string;
      nonPaymentStrikeCount: number;
    };
  }>;
  listings: Array<{
    id: string;
    status: string;
    title: string;
    fulfillmentMode: string;
  }>;
  orders: Array<{
    id: string;
    buyerUserId: string;
    listingId: string;
    source: string;
    status: string;
    paymentDeadlineAtUtc: Date;
    selectedFulfillmentMode: "pickup_only" | "shipping_only" | null;
    pickupEventId: string | null;
    shippingAddressText: string | null;
  }>;
  payments: Array<{
    id: string;
    orderId: string;
    status: string;
    sitePaymentMethodId: string;
    amountCents: number;
    payerHandle: string;
    externalReference: string | null;
    submittedByUserId: string;
    submittedAtUtc: Date;
  }>;
  sitePaymentMethods: Array<{
    id: string;
    code: string;
    displayName: string;
    isEnabled: boolean;
  }>;
};

function buildState(overrides?: Partial<FakeState>): FakeState {
  return {
    users: [
      {
        id: "buyer_1",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0",
          nonPaymentStrikeCount: 0
        }
      },
      {
        id: "buyer_2",
        emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z",
        bidderProfile: {
          isBlocked: false,
          maxBidTier: "tier_0",
          nonPaymentStrikeCount: 0
        }
      }
    ],
    listings: [
      {
        id: "listing_1",
        status: "sold_pending_payment",
        title: "Reserved fixed-price item",
        fulfillmentMode: "pickup_only"
      }
    ],
    orders: [
      {
        id: "order_1",
        buyerUserId: "buyer_1",
        listingId: "listing_1",
        source: "fixed_price_claim",
        status: "awaiting_payment",
        paymentDeadlineAtUtc: new Date("2026-04-25T12:00:00.000Z"),
        selectedFulfillmentMode: "pickup_only",
        pickupEventId: "pickup_1",
        shippingAddressText: null
      }
    ],
    payments: [],
    sitePaymentMethods: [
      {
        id: "pm_1",
        code: "paypal",
        displayName: "PayPal",
        isEnabled: true
      }
    ],
    ...overrides
  };
}

function findUser(state: FakeState, userId: string) {
  const user = state.users.find((candidate) => candidate.id === userId);

  if (!user) {
    throw new Error(`Missing user ${userId}`);
  }

  return user;
}

function findListing(state: FakeState, listingId: string) {
  const listing = state.listings.find((candidate) => candidate.id === listingId);

  if (!listing) {
    throw new Error(`Missing listing ${listingId}`);
  }

  return listing;
}

function findOrder(state: FakeState, orderId: string) {
  const order = state.orders.find((candidate) => candidate.id === orderId);

  if (!order) {
    throw new Error(`Missing order ${orderId}`);
  }

  return order;
}

function findPaymentMethod(state: FakeState, paymentMethodId: string) {
  const paymentMethod = state.sitePaymentMethods.find(
    (candidate) => candidate.id === paymentMethodId
  );

  if (!paymentMethod) {
    throw new Error(`Missing payment method ${paymentMethodId}`);
  }

  return paymentMethod;
}

function createTransactionClient(state: FakeState) {
  return {
    order: {
      findFirst: vi.fn(
        async (args: {
          where: {
            id?: string;
            buyerUserId?: string;
            listingId?: string;
            source?: string;
            status?: {
              in: string[];
            };
          };
          include?: Record<string, unknown>;
          orderBy?: Array<Record<string, "desc" | "asc">>;
          select?: Record<string, boolean>;
        }) => {
          if (args.where.id) {
            const order = state.orders.find(
              (candidate) =>
                candidate.id === args.where.id &&
                candidate.buyerUserId === args.where.buyerUserId
            );

            if (!order) {
              return null;
            }

            const buyerUser = findUser(state, order.buyerUserId);
            const listing = findListing(state, order.listingId);
            const pendingPayments = state.payments
              .filter(
                (payment) => payment.orderId === order.id && payment.status === "pending_review"
              )
              .slice(0, 1)
              .map((payment) => ({ id: payment.id }));

            return {
              ...order,
              buyerUser: {
                id: buyerUser.id,
                role: "bidder",
                emailVerifiedAtUtc: buyerUser.emailVerifiedAtUtc,
                bidderProfile: buyerUser.bidderProfile
              },
              pickupEvent: order.pickupEventId ? { id: order.pickupEventId } : null,
              payments: pendingPayments,
              listing: {
                id: listing.id,
                status: listing.status,
                fulfillmentMode: listing.fulfillmentMode
              }
            };
          }

          const reservation = state.orders.find((candidate) => {
            if (candidate.listingId !== args.where.listingId) {
              return false;
            }

            if (candidate.source !== args.where.source) {
              return false;
            }

            if (args.where.status?.in && !args.where.status.in.includes(candidate.status)) {
              return false;
            }

            return true;
          });

          return reservation
            ? {
                id: reservation.id,
                buyerUserId: reservation.buyerUserId,
                status: reservation.status
              }
            : null;
        }
      ),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: {
            status: string;
          };
        }) => {
          const order = findOrder(state, args.where.id);
          order.status = args.data.status;
          return order;
        }
      )
    },
    payment: {
      create: vi.fn(
        async (args: {
          data: {
            orderId: string;
            submittedByUserId: string;
            sitePaymentMethodId: string;
            amountCents: number;
            payerHandle: string;
            externalReference: string | null;
            proofAssetKey: string | null;
            status: string;
            submittedAtUtc: Date;
          };
        }) => {
          const createdPayment = {
            id: `payment_${state.payments.length + 1}`,
            ...args.data
          };
          const order = findOrder(state, createdPayment.orderId);
          const listing = findListing(state, order.listingId);

          state.payments.push(createdPayment);

          return {
            ...createdPayment,
            sitePaymentMethod: findPaymentMethod(state, createdPayment.sitePaymentMethodId),
            submittedByUser: {
              id: createdPayment.submittedByUserId,
              email: `${createdPayment.submittedByUserId}@example.com`
            },
            reviewedByUser: null,
            order: {
              listing: {
                ...listing,
                images: []
              }
            }
          };
        }
      )
    }
  };
}

describe("fixed-price reservation payment submission", () => {
  let state: FakeState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = buildState();

    prismaMock.prisma.sitePaymentMethod.findFirst.mockImplementation(
      async (args: { where: { id: string; isEnabled: boolean } }) =>
        state.sitePaymentMethods.find(
          (candidate) => candidate.id === args.where.id && candidate.isEnabled
        ) ?? null
    );
    prismaMock.prisma.user.findMany.mockResolvedValue([
      {
        email: "admin@example.com"
      }
    ]);

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const transactionState = structuredClone(state) as FakeState;
      const result = await callback(createTransactionClient(transactionState));
      state = transactionState;
      return result;
    });
  });

  it("creates a pending admin-review payment for a reserved fixed-price order", async () => {
    const payment = await submitOrderPayment({
      orderId: "order_1",
      submittedByUserId: "buyer_1",
      paymentMethodId: "pm_1",
      amountCents: 12_500,
      payerHandle: "@buyer1",
      externalReference: "reservation-1",
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(payment.status).toBe("pending_review");
    expect(payment.orderId).toBe("order_1");
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      status: "pending_review",
      orderId: "order_1",
      submittedByUserId: "buyer_1",
      amountCents: 12_500
    });
    expect(findOrder(state, "order_1").status).toBe("payment_submitted");
    expect(notificationMocks.sendPaymentSubmittedForReviewNotification).toHaveBeenCalledWith({
      orderId: "order_1",
      buyerEmail: "buyer_1@example.com",
      listingTitle: "Reserved fixed-price item"
    });
    expect(notificationMocks.sendAdminPaymentSubmittedNotification).toHaveBeenCalledWith({
      paymentId: "payment_1",
      orderId: "order_1",
      adminEmail: "admin@example.com",
      buyerEmail: "buyer_1@example.com",
      listingTitle: "Reserved fixed-price item",
      paymentMethodLabel: "PayPal"
    });
  });

  it("rejects payment submissions from a different user", async () => {
    await expect(
      submitOrderPayment({
        orderId: "order_1",
        submittedByUserId: "buyer_2",
        paymentMethodId: "pm_1",
        amountCents: 12_500,
        payerHandle: "@buyer2",
        externalReference: "not-owner",
        now: new Date("2026-04-24T12:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: OrderActionError.name,
      code: "order_not_found"
    });

    expect(state.payments).toHaveLength(0);
  });

  it("rejects payment when the fixed-price reservation has already been released", async () => {
    state = buildState({
      listings: [
        {
          id: "listing_1",
          status: "published",
          title: "Reserved fixed-price item",
          fulfillmentMode: "pickup_only"
        }
      ]
    });

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const transactionState = structuredClone(state) as FakeState;
      const result = await callback(createTransactionClient(transactionState));
      state = transactionState;
      return result;
    });

    await expect(
      submitOrderPayment({
        orderId: "order_1",
        submittedByUserId: "buyer_1",
        paymentMethodId: "pm_1",
        amountCents: 12_500,
        payerHandle: "@buyer1",
        externalReference: "released",
        now: new Date("2026-04-24T12:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: OrderActionError.name,
      code: "listing_unavailable"
    });
  });

  it("rejects payment submissions after the reservation payment deadline", async () => {
    state = buildState({
      orders: [
        {
          id: "order_1",
          buyerUserId: "buyer_1",
          listingId: "listing_1",
          source: "fixed_price_claim",
          status: "awaiting_payment",
          paymentDeadlineAtUtc: new Date("2026-04-24T10:00:00.000Z"),
          selectedFulfillmentMode: "pickup_only",
          pickupEventId: "pickup_1",
          shippingAddressText: null
        }
      ]
    });

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const transactionState = structuredClone(state) as FakeState;
      const result = await callback(createTransactionClient(transactionState));
      state = transactionState;
      return result;
    });

    await expect(
      submitOrderPayment({
        orderId: "order_1",
        submittedByUserId: "buyer_1",
        paymentMethodId: "pm_1",
        amountCents: 12_500,
        payerHandle: "@buyer1",
        externalReference: "late",
        now: new Date("2026-04-24T12:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: OrderActionError.name,
      code: "order_not_payable"
    });

    expect(state.payments).toHaveLength(0);
  });
});
