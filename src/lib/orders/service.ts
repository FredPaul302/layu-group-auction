import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  assertFixedPriceClaimGate,
  canEditFulfillmentSelection,
  isFulfillmentSelectionComplete,
  getFixedPriceClaimGate,
  getOrderFinancials,
  resolveFulfillmentSelection,
  resolveAdminOrderStatusAction,
  OrderActionError,
  type ShippingAddressInput
} from "./rules";
import {
  sendOrderCompletedNotification,
  sendOrderPaidNotification,
  sendOrderReadyForFulfillmentNotification
} from "@/lib/notifications/workflow-events";

const maxSerializableRetries = 3;

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
      return await prisma.$transaction(
        async (transaction) => {
          const [listing, buyer] = await Promise.all([
            transaction.listing.findFirst({
              where: {
                id: input.listingId,
                listingType: "fixed_price"
              },
              select: {
                id: true,
                title: true,
                sellerUserId: true,
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

          const gate = getFixedPriceClaimGate({
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

          assertFixedPriceClaimGate(gate);

          if (!listing?.fixedPriceCents) {
            throw new OrderActionError(
              "listing_unavailable",
              409,
              "This listing is no longer available to claim."
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
              "This listing is no longer available to claim."
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

          const order = await transaction.order.create({
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

          return order;
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

  throw new Error("Fixed-price claim could not be completed.");
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
            fulfillmentMode: true
          }
        }
      }
    });

    if (!order) {
      throw new OrderActionError("order_not_found", 404, "Order could not be found.");
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
      await transaction.listing.update({
        where: {
          id: order.listing.id
        },
        data: {
          status: nextState.listingStatus
        }
      });
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
