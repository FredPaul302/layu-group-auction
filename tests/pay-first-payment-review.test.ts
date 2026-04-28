import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = {
  id: string;
  email: string;
  displayName: string | null;
};

type FakeListing = {
  id: string;
  title: string;
  status: string;
};

type FakeOrder = {
  id: string;
  listingId: string;
  buyerUserId: string;
  source: string;
  status: string;
  paidAtUtc: Date | null;
};

type FakePayment = {
  id: string;
  orderId: string;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  sitePaymentMethodId: string;
  amountCents: number;
  payerHandle: string;
  externalReference: string | null;
  proofAssetKey: string | null;
  reviewNotes: string | null;
  status: string;
  submittedAtUtc: Date;
  reviewedAtUtc: Date | null;
};

type FakeState = {
  users: FakeUser[];
  listings: FakeListing[];
  orders: FakeOrder[];
  payments: FakePayment[];
  sitePaymentMethods: Array<{
    id: string;
    displayName: string;
  }>;
};

const prismaMock = vi.hoisted(() => ({
  prisma: {
    payment: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

const notificationMocks = vi.hoisted(() => ({
  sendAdminPaymentSubmittedNotification: vi.fn(),
  sendAuctionWonPaymentInstructionsNotification: vi.fn(),
  sendFixedPriceReservationCreatedNotification: vi.fn(),
  sendFixedPriceReservationReleasedNotification: vi.fn(),
  sendOrderPaidNotification: vi.fn(),
  sendOrderPaymentOverdueNotification: vi.fn(),
  sendOrderReadyForFulfillmentNotification: vi.fn(),
  sendPaymentRejectedNotification: vi.fn(),
  sendPaymentSubmittedForReviewNotification: vi.fn(),
  sendRunnerUpOfferSentNotification: vi.fn(),
  sendOrderCompletedNotification: vi.fn()
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/notifications/workflow-events", () => notificationMocks);

import { OrderActionError } from "../src/lib/orders/index.js";
import { reviewPaymentSubmission } from "../src/lib/payments/service.js";

function buildState(overrides?: Partial<FakeState>): FakeState {
  return {
    users: [
      {
        id: "admin_1",
        email: "admin@example.com",
        displayName: "Admin"
      },
      {
        id: "buyer_1",
        email: "buyer1@example.com",
        displayName: "Buyer One"
      },
      {
        id: "buyer_2",
        email: "buyer2@example.com",
        displayName: "Buyer Two"
      }
    ],
    listings: [
      {
        id: "listing_1",
        title: "Rare fixed-price item",
        status: "published"
      }
    ],
    orders: [
      {
        id: "order_1",
        listingId: "listing_1",
        buyerUserId: "buyer_1",
        source: "fixed_price_pay_first",
        status: "payment_submitted",
        paidAtUtc: null
      },
      {
        id: "order_2",
        listingId: "listing_1",
        buyerUserId: "buyer_2",
        source: "fixed_price_pay_first",
        status: "payment_submitted",
        paidAtUtc: null
      }
    ],
    payments: [
      {
        id: "payment_1",
        orderId: "order_1",
        submittedByUserId: "buyer_1",
        reviewedByUserId: null,
        sitePaymentMethodId: "pm_1",
        amountCents: 12_500,
        payerHandle: "@buyer1",
        externalReference: "ord-1",
        proofAssetKey: null,
        reviewNotes: null,
        status: "pending_review",
        submittedAtUtc: new Date("2026-04-24T11:00:00.000Z"),
        reviewedAtUtc: null
      },
      {
        id: "payment_2",
        orderId: "order_2",
        submittedByUserId: "buyer_2",
        reviewedByUserId: null,
        sitePaymentMethodId: "pm_1",
        amountCents: 12_500,
        payerHandle: "@buyer2",
        externalReference: "ord-2",
        proofAssetKey: null,
        reviewNotes: null,
        status: "pending_review",
        submittedAtUtc: new Date("2026-04-24T11:05:00.000Z"),
        reviewedAtUtc: null
      }
    ],
    sitePaymentMethods: [
      {
        id: "pm_1",
        displayName: "PayPal"
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

function findPayment(state: FakeState, paymentId: string) {
  const payment = state.payments.find((candidate) => candidate.id === paymentId);

  if (!payment) {
    throw new Error(`Missing payment ${paymentId}`);
  }

  return payment;
}

function buildAdminPaymentRecord(state: FakeState, paymentId: string) {
  const payment = findPayment(state, paymentId);
  const order = findOrder(state, payment.orderId);
  const listing = findListing(state, order.listingId);
  const buyerUser = findUser(state, order.buyerUserId);
  const submittedByUser = findUser(state, payment.submittedByUserId);
  const reviewedByUser = payment.reviewedByUserId
    ? findUser(state, payment.reviewedByUserId)
    : null;
  const sitePaymentMethod = state.sitePaymentMethods.find(
    (candidate) => candidate.id === payment.sitePaymentMethodId
  );

  if (!sitePaymentMethod) {
    throw new Error(`Missing payment method ${payment.sitePaymentMethodId}`);
  }

  return {
    ...payment,
    sitePaymentMethod,
    submittedByUser: {
      id: submittedByUser.id,
      email: submittedByUser.email
    },
    reviewedByUser: reviewedByUser
      ? {
          id: reviewedByUser.id,
          email: reviewedByUser.email,
          displayName: reviewedByUser.displayName
        }
      : null,
    order: {
      ...order,
      listing: {
        ...listing,
        images: []
      },
      buyerUser: {
        id: buyerUser.id,
        email: buyerUser.email,
        displayName: buyerUser.displayName
      }
    }
  };
}

function createTransactionClient(state: FakeState) {
  return {
    payment: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const payment = state.payments.find((candidate) => candidate.id === args.where.id);

        if (!payment) {
          return null;
        }

        const order = findOrder(state, payment.orderId);
        const listing = findListing(state, order.listingId);
        const buyerUser = findUser(state, order.buyerUserId);

        return {
          ...payment,
          order: {
            ...order,
            listing: {
              id: listing.id,
              title: listing.title,
              status: listing.status
            },
            buyerUser: {
              email: buyerUser.email
            }
          }
        };
      }),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: Partial<FakePayment>;
        }) => {
          const payment = findPayment(state, args.where.id);
          Object.assign(payment, args.data);

          return buildAdminPaymentRecord(state, payment.id);
        }
      )
    },
    order: {
      findFirst: vi.fn(
        async (args: {
          where: {
            listingId: string;
            source: string;
            id?: {
              not: string;
            };
            OR?: Array<
              | {
                  status: {
                    in: string[];
                  };
                }
              | {
                  payments: {
                    some: {
                      status: string;
                    };
                  };
                }
            >;
          };
        }) => {
          return (
            state.orders.find((order) => {
              if (order.listingId !== args.where.listingId) {
                return false;
              }

              if (order.source !== args.where.source) {
                return false;
              }

              if (args.where.id?.not && order.id === args.where.id.not) {
                return false;
              }

              if (!args.where.OR?.length) {
                return true;
              }

              return args.where.OR.some((clause) => {
                if ("status" in clause) {
                  return clause.status.in.includes(order.status);
                }

                return state.payments.some(
                  (payment) =>
                    payment.orderId === order.id &&
                    payment.status === clause.payments.some.status
                );
              });
            }) ?? null
          );
        }
      ),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: Partial<FakeOrder>;
        }) => {
          const order = findOrder(state, args.where.id);
          Object.assign(order, args.data);
          return order;
        }
      )
    },
    listing: {
      updateMany: vi.fn(
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
      )
    }
  };
}

describe("fixed-price pay-first payment review", () => {
  let state: FakeState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = buildState();

    prismaMock.prisma.payment.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        const payment = state.payments.find((candidate) => candidate.id === args.where.id);

        if (!payment) {
          return null;
        }

        const order = findOrder(state, payment.orderId);

        return {
          order: {
            source: order.source
          }
        };
      }
    );

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const transactionState = structuredClone(state) as FakeState;
      const result = await callback(createTransactionClient(transactionState));
      state = transactionState;
      return result;
    });
  });

  it("allows exactly one pay-first payment approval to win a listing", async () => {
    const result = await reviewPaymentSubmission({
      paymentId: "payment_1",
      reviewedByUserId: "admin_1",
      decision: "approve",
      reviewNotes: "Confirmed",
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    expect(result.status).toBe("approved");
    expect(result.order.id).toBe("order_1");
    expect(findListing(state, "listing_1").status).toBe("paid");
    expect(findOrder(state, "order_1").status).toBe("paid");
    expect(findPayment(state, "payment_1").status).toBe("approved");
    expect(notificationMocks.sendOrderPaidNotification).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly when a later pay-first approval tries to overtake an existing winner", async () => {
    await reviewPaymentSubmission({
      paymentId: "payment_1",
      reviewedByUserId: "admin_1",
      decision: "approve",
      reviewNotes: "Confirmed",
      now: new Date("2026-04-24T12:00:00.000Z")
    });

    await expect(
      reviewPaymentSubmission({
        paymentId: "payment_2",
        reviewedByUserId: "admin_1",
        decision: "approve",
        reviewNotes: "Too late",
        now: new Date("2026-04-24T12:05:00.000Z")
      })
    ).rejects.toMatchObject({
      name: OrderActionError.name,
      code: "listing_unavailable"
    });

    expect(findListing(state, "listing_1").status).toBe("paid");
    expect(findOrder(state, "order_1").status).toBe("paid");
    expect(findPayment(state, "payment_1").status).toBe("approved");
    expect(findOrder(state, "order_2").status).toBe("payment_submitted");
    expect(findPayment(state, "payment_2").status).toBe("pending_review");
    expect(notificationMocks.sendOrderPaidNotification).toHaveBeenCalledTimes(1);
  });
});
