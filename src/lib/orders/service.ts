import type { OrderStatus, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  assertFixedPricePayFirstGate,
  canEditFulfillmentSelection,
  isFulfillmentSelectionComplete,
  getFixedPricePayFirstGate,
  getOrderFinancials,
  resolveFulfillmentSelection,
  resolveAdminOrderStatusAction,
  OrderActionError,
  type ShippingAddressInput
} from "./rules";
import {
  sendFixedPriceReservationCreatedNotification,
  sendOrderCompletedNotification,
  sendOrderPaidNotification,
  sendOrderReadyForFulfillmentNotification
} from "@/lib/notifications/workflow-events";

const maxSerializableRetries = 3;
const activeFixedPriceReservationStatuses: OrderStatus[] = [
  "awaiting_payment",
  "payment_submitted"
];
const activePayFirstOrderStatuses: OrderStatus[] = [
  "awaiting_payment",
  "payment_submitted",
  "payment_rejected"
];

function isSerializableRetryError(error: unknown) {
  return error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2034";
}

async function getWinnerPaymentWindowHours() {
  const siteSetting = await prisma.siteSetting.findUnique({
    where: {
      id: 1
    },
    select: {
      defaultWinnerPaymentWindowHours: true
    }
  });

  return siteSetting?.defaultWinnerPaymentWindowHours ?? 48;
}

async function findCurrentFixedPriceReservation(
  transaction: Prisma.TransactionClient,
  input: {
    listingId: string;
  }
) {
  return transaction.order.findFirst({
    where: {
      listingId: input.listingId,
      source: "fixed_price_claim",
      status: {
        in: activeFixedPriceReservationStatuses
      }
    },
    orderBy: [{ createdAtUtc: "desc" }],
    select: {
      id: true,
      buyerUserId: true,
      status: true
    }
  });
}

const accountOrderInclude = {
  pickupEvent: true,
  listing: {
    include: {
      category: true,
      pickupEvent: true,
      images: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  },
  payments: {
    include: {
      sitePaymentMethod: true
    },
    orderBy: {
      submittedAtUtc: "desc"
    }
  },
  winningBid: true,
  runnerUpOffer: true
} satisfies Prisma.OrderInclude;

const adminOrderInclude = {
  ...accountOrderInclude,
  buyerUser: {
    select: {
      id: true,
      email: true,
      displayName: true
    }
  }
} satisfies Prisma.OrderInclude;

export type AccountOrderRecord = Prisma.OrderGetPayload<{
  include: typeof accountOrderInclude;
}>;

export type AdminOrderRecord = Prisma.OrderGetPayload<{
  include: typeof adminOrderInclude;
}>;

export async function claimFixedPriceListing(input: {
  listingId: string;
  buyerUserId: string;
  now?: Date;
}) {
  const claimedAtUtc = input.now ?? new Date();
  const paymentWindowHours = await getWinnerPaymentWindowHours();

  for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const existingOrder = await transaction.order.findFirst({
            where: {
              listingId: input.listingId,
              buyerUserId: input.buyerUserId,
              source: "fixed_price_claim",
              status: {
                in: activeFixedPriceReservationStatuses
              }
            },
            include: accountOrderInclude,
            orderBy: [{ createdAtUtc: "desc" }]
          });

          if (existingOrder) {
            return {
              order: existingOrder,
              notification: null
            };
          }

          const [listing, buyer] = await Promise.all([
            transaction.listing.findFirst({
              where: {
                id: input.listingId,
                listingType: "fixed_price"
              },
              select: {
                id: true,
                title: true,
                listingType: true,
                status: true,
                fixedPriceCents: true,
                fulfillmentMode: true,
                shippingFeeCents: true,
                pickupEventId: true,
                category: {
                  select: {
                    requiredBidTier: true
                  }
                }
              }
            }),
            transaction.user.findUnique({
              where: {
                id: input.buyerUserId
              },
              select: {
                id: true,
                role: true,
                email: true,
                emailVerifiedAtUtc: true,
                bidderProfile: {
                  select: {
                    isBlocked: true,
                    maxBidTier: true,
                    nonPaymentStrikeCount: true
                  }
                }
              }
            })
          ]);

          const gate = getFixedPricePayFirstGate({
            subject: buyer,
            snapshot: {
              listingType: listing?.listingType ?? "fixed_price",
              listingStatus: listing?.status ?? "archived",
              fixedPriceCents: listing?.fixedPriceCents ?? null,
              requiredBidTier: listing?.category.requiredBidTier ?? "tier_20",
              fulfillmentMode: listing?.fulfillmentMode ?? "pickup_only",
              shippingFeeCents: listing?.shippingFeeCents ?? 0
            }
          });

          assertFixedPricePayFirstGate(gate);

          if (!listing?.fixedPriceCents) {
            throw new OrderActionError(
              "listing_unavailable",
              409,
              "This listing is no longer available to reserve."
            );
          }

          const currentReservation = await findCurrentFixedPriceReservation(transaction, {
            listingId: listing.id
          });

          if (currentReservation) {
            throw new OrderActionError(
              "listing_unavailable",
              409,
              "This listing is already reserved pending payment."
            );
          }

          const updatedListing = await transaction.listing.updateMany({
            where: {
              id: listing.id,
              status: "published"
            },
            data: {
              status: "sold_pending_payment"
            }
          });

          if (updatedListing.count !== 1) {
            throw new OrderActionError(
              "listing_unavailable",
              409,
              "This listing is no longer available to reserve."
            );
          }

          const financials = getOrderFinancials({
            subtotalCents: listing.fixedPriceCents,
            fulfillmentMode: listing.fulfillmentMode,
            shippingFeeCents: listing.shippingFeeCents
          });
          const paymentDeadlineAtUtc = new Date(
            claimedAtUtc.getTime() + paymentWindowHours * 60 * 60 * 1000
          );

          const createdOrder = await transaction.order.create({
            data: {
              listingId: listing.id,
              buyerUserId: input.buyerUserId,
              source: "fixed_price_claim",
              status: "awaiting_payment",
              subtotalCents: financials.subtotalCents,
              shippingFeeCents: financials.shippingFeeCents,
              totalCents: financials.totalCents,
              selectedFulfillmentMode: financials.selectedFulfillmentMode,
              pickupEventId:
                listing.fulfillmentMode === "pickup_only" ? listing.pickupEventId : null,
              paymentDeadlineAtUtc
            },
            include: accountOrderInclude
          });

          return {
            order: createdOrder,
            notification: {
              orderId: createdOrder.id,
              buyerEmail: buyer?.email ?? "",
              listingTitle: listing.title,
              paymentDeadlineAtUtc
            }
          };
        },
        {
          isolationLevel: PrismaNamespace.TransactionIsolationLevel.Serializable
        }
      );

      if (result.notification?.buyerEmail) {
        await sendFixedPriceReservationCreatedNotification(result.notification);
      }

      return result.order;
    } catch (error) {
      if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Fixed-price reservation could not be completed.");
}

export async function getOrCreatePayFirstOrder(input: {
  listingId: string;
  buyerUserId: string;
  now?: Date;
}) {
  const createdAtUtc = input.now ?? new Date();
  const paymentWindowHours = await getWinnerPaymentWindowHours();

  for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const existingOrder = await transaction.order.findFirst({
            where: {
              listingId: input.listingId,
              buyerUserId: input.buyerUserId,
              source: "fixed_price_pay_first",
              status: {
                in: activePayFirstOrderStatuses
              }
            },
            include: accountOrderInclude,
            orderBy: [{ createdAtUtc: "desc" }]
          });

          if (existingOrder) {
            return existingOrder;
          }

          const [listing, buyer] = await Promise.all([
            transaction.listing.findFirst({
              where: {
                id: input.listingId,
                listingType: "fixed_price"
              },
              select: {
                id: true,
                title: true,
                listingType: true,
                status: true,
                fixedPriceCents: true,
                fulfillmentMode: true,
                shippingFeeCents: true,
                pickupEventId: true,
                category: {
                  select: {
                    requiredBidTier: true
                  }
                }
              }
            }),
            transaction.user.findUnique({
              where: {
                id: input.buyerUserId
              },
              select: {
                id: true,
                role: true,
                emailVerifiedAtUtc: true,
                bidderProfile: {
                  select: {
                    isBlocked: true,
                    maxBidTier: true,
                    nonPaymentStrikeCount: true
                  }
                }
              }
            })
          ]);

          const gate = getFixedPricePayFirstGate({
            subject: buyer,
            snapshot: {
              listingType: listing?.listingType ?? "fixed_price",
              listingStatus: listing?.status ?? "archived",
              fixedPriceCents: listing?.fixedPriceCents ?? null,
              requiredBidTier: listing?.category.requiredBidTier ?? "tier_20",
              fulfillmentMode: listing?.fulfillmentMode ?? "pickup_only",
              shippingFeeCents: listing?.shippingFeeCents ?? 0
            }
          });

          assertFixedPricePayFirstGate(gate);

          if (!listing?.fixedPriceCents) {
            throw new OrderActionError(
              "listing_unavailable",
              409,
              "This listing is no longer available for checkout."
            );
          }

          const financials = getOrderFinancials({
            subtotalCents: listing.fixedPriceCents,
            fulfillmentMode: listing.fulfillmentMode,
            shippingFeeCents: listing.shippingFeeCents
          });
          const paymentDeadlineAtUtc = new Date(
            createdAtUtc.getTime() + paymentWindowHours * 60 * 60 * 1000
          );

          return transaction.order.create({
            data: {
              listingId: listing.id,
              buyerUserId: input.buyerUserId,
              source: "fixed_price_pay_first",
              status: "awaiting_payment",
              subtotalCents: financials.subtotalCents,
              shippingFeeCents: financials.shippingFeeCents,
              totalCents: financials.totalCents,
              selectedFulfillmentMode: financials.selectedFulfillmentMode,
              pickupEventId:
                listing.fulfillmentMode === "pickup_only" ? listing.pickupEventId : null,
              paymentDeadlineAtUtc
            },
            include: accountOrderInclude
          });
        },
        {
          isolationLevel: PrismaNamespace.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Fixed-price checkout could not be completed.");
}

export async function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: {
      buyerUserId: userId
    },
    include: accountOrderInclude,
    orderBy: [{ createdAtUtc: "desc" }]
  });
}

export async function getAccountOrderById(input: {
  orderId: string;
  userId: string;
}) {
  return prisma.order.findFirstOrThrow({
    where: {
      id: input.orderId,
      buyerUserId: input.userId
    },
    include: accountOrderInclude
  });
}

export async function getAccountOrderByListingId(input: {
  listingId: string;
  userId: string;
}) {
  return prisma.order.findFirstOrThrow({
    where: {
      listingId: input.listingId,
      buyerUserId: input.userId
    },
    include: accountOrderInclude,
    orderBy: [{ createdAtUtc: "desc" }]
  });
}

export async function listAdminOrders() {
  return prisma.order.findMany({
    include: adminOrderInclude,
    orderBy: [{ updatedAtUtc: "desc" }]
  });
}

export async function updateOrderFulfillmentSelection(input: {
  listingId: string;
  userId: string;
  desiredFulfillmentMode: "pickup_only" | "shipping_only";
  shippingAddress?: ShippingAddressInput | null;
}) {
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findFirst({
      where: {
        listingId: input.listingId,
        buyerUserId: input.userId
      },
      orderBy: [{ createdAtUtc: "desc" }],
      select: {
        id: true,
        status: true,
        subtotalCents: true,
        shippingFeeCents: true,
        totalCents: true,
        pickupEventId: true,
        shippingAddressText: true,
        selectedFulfillmentMode: true,
        listing: {
          select: {
            id: true,
            fulfillmentMode: true,
            shippingFeeCents: true,
            pickupEventId: true
          }
        }
      }
    });

    if (!order) {
      throw new OrderActionError("order_not_found", 404, "Order could not be found.");
    }

    if (!canEditFulfillmentSelection(order.status)) {
      throw new OrderActionError(
        "order_status_invalid",
        409,
        "Fulfillment details can no longer be changed for this order."
      );
    }

    const nextSelection = resolveFulfillmentSelection({
      orderStatus: order.status,
      listingFulfillmentMode: order.listing.fulfillmentMode,
      desiredFulfillmentMode: input.desiredFulfillmentMode,
      subtotalCents: order.subtotalCents,
      listingShippingFeeCents: order.listing.shippingFeeCents,
      pickupEventId: order.pickupEventId ?? order.listing.pickupEventId,
      shippingAddress: input.shippingAddress ?? null
    });

    return transaction.order.update({
      where: {
        id: order.id
      },
      data: {
        selectedFulfillmentMode: nextSelection.selectedFulfillmentMode,
        pickupEventId: nextSelection.pickupEventId,
        shippingAddressText: nextSelection.shippingAddressText,
        shippingFeeCents: nextSelection.shippingFeeCents,
        totalCents: nextSelection.totalCents
      },
      include: accountOrderInclude
    });
  });
}

export async function updateOrderStatusByAdmin(input: {
  orderId: string;
  action:
    | "mark_paid"
    | "mark_ready_for_fulfillment"
    | "mark_fulfilled"
    | "mark_completed"
    | "mark_cancelled";
  now?: Date;
}) {
  const now = input.now ?? new Date();

  const updatedOrder = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: {
        id: input.orderId
      },
      include: {
        payments: {
          select: {
            id: true,
            status: true
          }
        },
        pickupEvent: true,
        buyerUser: {
          select: {
            email: true,
            displayName: true
          }
        },
        listing: {
          select: {
            id: true,
            title: true,
            fulfillmentMode: true,
            status: true
          }
        }
      }
    });

    if (!order) {
      throw new OrderActionError("order_not_found", 404, "Order could not be found.");
    }

    if (input.action === "mark_paid" && order.source === "fixed_price_claim") {
      const hasApprovedPayment = order.payments.some((payment) => payment.status === "approved");

      if (!hasApprovedPayment) {
        throw new OrderActionError(
          "payment_review_invalid",
          409,
          "Confirm a payment submission before marking a fixed-price reservation paid."
        );
      }

      const currentReservation = await findCurrentFixedPriceReservation(transaction, {
        listingId: order.listing.id,
      });

      if (currentReservation?.id !== order.id || order.listing.status !== "sold_pending_payment") {
        throw new OrderActionError(
          "listing_unavailable",
          409,
          "This fixed-price reservation is no longer active."
        );
      }
    }

    const nextState = resolveAdminOrderStatusAction({
      action: input.action,
      orderStatus: order.status,
      now,
      fulfillmentSelectionComplete: isFulfillmentSelectionComplete({
        selectedFulfillmentMode: order.selectedFulfillmentMode,
        pickupEventId: order.pickupEventId,
        shippingAddressText: order.shippingAddressText
      })
    });

    const updatedOrder = await transaction.order.update({
      where: {
        id: order.id
      },
      data: {
        status: nextState.orderStatus,
        paidAtUtc: nextState.paidAtUtc ?? undefined,
        fulfilledAtUtc: nextState.fulfilledAtUtc ?? undefined,
        cancelledAtUtc: nextState.cancelledAtUtc ?? undefined
      },
      include: adminOrderInclude
    });

    if (nextState.listingStatus) {
      if (input.action === "mark_paid" && order.source === "fixed_price_claim") {
        const updatedListing = await transaction.listing.updateMany({
          where: {
            id: order.listing.id,
            status: "sold_pending_payment"
          },
          data: {
            status: nextState.listingStatus
          }
        });

        if (updatedListing.count !== 1) {
          throw new OrderActionError(
            "listing_unavailable",
            409,
            "This fixed-price reservation is no longer active."
          );
        }
      } else {
        await transaction.listing.update({
          where: {
            id: order.listing.id
          },
          data: {
            status: nextState.listingStatus
          }
        });
      }
    } else if (input.action === "mark_cancelled" && order.source === "fixed_price_claim") {
      const currentReservation = await findCurrentFixedPriceReservation(transaction, {
        listingId: order.listing.id
      });

      if (currentReservation?.id === order.id && order.listing.status === "sold_pending_payment") {
        await transaction.listing.updateMany({
          where: {
            id: order.listing.id,
            status: "sold_pending_payment"
          },
          data: {
            status: "published"
          }
        });
      }
    }

    return updatedOrder;
  });

  if (input.action === "mark_paid") {
    await sendOrderPaidNotification({
      orderId: updatedOrder.id,
      buyerEmail: updatedOrder.buyerUser.email,
      listingTitle: updatedOrder.listing.title
    });
  }

  if (input.action === "mark_ready_for_fulfillment") {
    await sendOrderReadyForFulfillmentNotification({
      orderId: updatedOrder.id,
      buyerEmail: updatedOrder.buyerUser.email,
      listingTitle: updatedOrder.listing.title
    });
  }

  if (input.action === "mark_completed") {
    await sendOrderCompletedNotification({
      orderId: updatedOrder.id,
      buyerEmail: updatedOrder.buyerUser.email,
      listingTitle: updatedOrder.listing.title
    });
  }

  return updatedOrder;
}
