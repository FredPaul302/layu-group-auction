import { PaymentMethodCode, Prisma } from "@prisma/client";

import { isCommerceRestricted } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import {
  sendAdminPaymentSubmittedNotification,
  sendOrderPaidNotification,
  sendPaymentRejectedNotification,
  sendPaymentSubmittedForReviewNotification
} from "@/lib/notifications/workflow-events";

import {
  isFulfillmentSelectionComplete,
  OrderActionError,
  resolvePaymentReviewTransition,
  resolvePaymentSubmissionStatus
} from "../orders";

const manualPaymentMethodCodes = [
  PaymentMethodCode.paypal,
  PaymentMethodCode.venmo,
  PaymentMethodCode.cash_app
] as const;

export type ExternalPaymentMethod = (typeof manualPaymentMethodCodes)[number];
const maxSerializableRetries = 3;
const activeFixedPriceReservationStatuses = ["awaiting_payment", "payment_submitted"] as const;
const winningPayFirstOrderStatuses = [
  "paid",
  "ready_for_fulfillment",
  "fulfilled",
  "completed"
] as const;

function isSerializableRetryError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

const accountPaymentInclude = {
  order: {
    include: {
      listing: {
        include: {
          images: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      }
    }
  },
  sitePaymentMethod: true,
  submittedByUser: {
    select: {
      id: true,
      email: true
    }
  },
  reviewedByUser: {
    select: {
      id: true,
      email: true,
      displayName: true
    }
  }
} satisfies Prisma.PaymentInclude;

const adminPaymentInclude = {
  ...accountPaymentInclude,
  order: {
    include: {
      listing: {
        include: {
          images: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      },
      buyerUser: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      }
    }
  }
} satisfies Prisma.PaymentInclude;

async function findEnabledManualPaymentMethod(paymentMethodId: string) {
  return prisma.sitePaymentMethod.findFirst({
    where: {
      id: paymentMethodId,
      code: {
        in: [...manualPaymentMethodCodes]
      },
      isEnabled: true
    }
  });
}

async function listAdminNotificationEmails() {
  const admins = await prisma.user.findMany({
    where: {
      role: "admin"
    },
    select: {
      email: true
    }
  });

  return [...new Set(admins.map((admin) => admin.email).filter(Boolean))];
}

function buildPaymentProofUrl(paymentId: string, proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return null;
  }

  return `/api/payments/${paymentId}/proof`;
}

async function storePaymentProofScreenshot(
  orderId: string,
  screenshotFile: File | null | undefined
) {
  if (!screenshotFile || screenshotFile.size === 0) {
    return null;
  }

  if (!screenshotFile.type.startsWith("image/")) {
    throw new Error("Only image payment proof uploads are supported.");
  }

  const storageAdapter = getStorageAdapter();
  const storedAsset = await storageAdapter.save({
    fileName: screenshotFile.name || `order-${orderId}-payment-proof`,
    contentType: screenshotFile.type,
    body: Buffer.from(await screenshotFile.arrayBuffer())
  });

  return storedAsset.key;
}

async function removeStoredPaymentProof(proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return;
  }

  try {
    await getStorageAdapter().remove(proofAssetKey);
  } catch (error) {
    console.error("Payment proof cleanup failed.", error);
  }
}

function getPayFirstSoldMessage() {
  return "This listing has already been sold through another approved payment.";
}

function getFixedPriceReservationReleasedMessage() {
  return "This fixed-price reservation is no longer active.";
}

async function findExistingPayFirstWinner(
  transaction: Prisma.TransactionClient,
  input: {
    listingId: string;
    excludeOrderId?: string;
  }
) {
  return transaction.order.findFirst({
    where: {
      listingId: input.listingId,
      source: "fixed_price_pay_first",
      ...(input.excludeOrderId
        ? {
            id: {
              not: input.excludeOrderId
            }
          }
        : {}),
      OR: [
        {
          status: {
            in: [...winningPayFirstOrderStatuses]
          }
        },
        {
          payments: {
            some: {
              status: "approved"
            }
          }
        }
      ]
    },
    select: {
      id: true,
      buyerUserId: true,
      status: true
    }
  });
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
        in: [...activeFixedPriceReservationStatuses]
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

export async function listEnabledManualPaymentMethods() {
  return prisma.sitePaymentMethod.findMany({
    where: {
      code: {
        in: [...manualPaymentMethodCodes]
      },
      isEnabled: true
    },
    orderBy: [{ sortOrder: "asc" }]
  });
}

export async function submitOrderPayment(input: {
  orderId: string;
  submittedByUserId: string;
  paymentMethodId: string;
  amountCents: number;
  payerHandle: string;
  externalReference: string;
  screenshotFile?: File | null;
  now?: Date;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new OrderActionError(
      "payment_submission_invalid",
      400,
      "Payment amount must be a positive whole-number cent value."
    );
  }

  const payerHandle = input.payerHandle.trim();

  if (!payerHandle) {
    throw new OrderActionError(
      "payment_submission_invalid",
      400,
      "Payer handle or payer name is required."
    );
  }

  const externalReference = input.externalReference.trim() || null;
  const now = input.now ?? new Date();
  const sitePaymentMethod = await findEnabledManualPaymentMethod(input.paymentMethodId);

  if (!sitePaymentMethod) {
    throw new OrderActionError(
      "payment_submission_invalid",
      400,
      "A valid payment method is required."
    );
  }

  let proofAssetKey: string | null = null;

  try {
    proofAssetKey = await storePaymentProofScreenshot(input.orderId, input.screenshotFile);

    for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
      try {
        const payment = await prisma.$transaction(
          async (transaction) => {
            const order = await transaction.order.findFirst({
              where: {
                id: input.orderId,
                buyerUserId: input.submittedByUserId
              },
              include: {
                buyerUser: {
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
                },
                pickupEvent: true,
                payments: {
                  where: {
                    status: "pending_review"
                  },
                  select: {
                    id: true
                  },
                  take: 1
                },
                listing: {
                  select: {
                    id: true,
                    status: true,
                    fulfillmentMode: true
                  }
                }
              }
            });

            if (!order) {
              throw new OrderActionError("order_not_found", 404, "Order could not be found.");
            }

            if (order.source === "fixed_price_pay_first") {
              if (!order.buyerUser.emailVerifiedAtUtc) {
                throw new OrderActionError(
                  "email_verification_required",
                  403,
                  "Email verification is required before submitting payment for this listing."
                );
              }

              if (isCommerceRestricted(order.buyerUser)) {
                throw new OrderActionError(
                  "bidder_blocked",
                  403,
                  "This account is restricted from fixed-price checkout."
                );
              }

              const existingWinner = await findExistingPayFirstWinner(transaction, {
                listingId: order.listing.id,
                excludeOrderId: order.id
              });

              if (order.listing.status !== "published" || existingWinner) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getPayFirstSoldMessage()
                );
              }
            } else if (order.source === "fixed_price_claim") {
              if (!order.buyerUser.emailVerifiedAtUtc) {
                throw new OrderActionError(
                  "email_verification_required",
                  403,
                  "Email verification is required before submitting payment for this listing."
                );
              }

              if (isCommerceRestricted(order.buyerUser)) {
                throw new OrderActionError(
                  "bidder_blocked",
                  403,
                  "This account is restricted from fixed-price checkout."
                );
              }

              const currentReservation = await findCurrentFixedPriceReservation(transaction, {
                listingId: order.listing.id
              });

              if (
                order.listing.status !== "sold_pending_payment" ||
                currentReservation?.id !== order.id
              ) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getFixedPriceReservationReleasedMessage()
                );
              }
            }

            const nextState = resolvePaymentSubmissionStatus({
              orderStatus: order.status,
              paymentDeadlineAtUtc: order.paymentDeadlineAtUtc,
              now,
              fulfillmentSelectionComplete: isFulfillmentSelectionComplete({
                selectedFulfillmentMode: order.selectedFulfillmentMode,
                pickupEventId: order.pickupEventId,
                shippingAddressText: order.shippingAddressText
              }),
              hasPendingReviewPayment: order.payments.length > 0
            });

            await transaction.order.update({
              where: {
                id: order.id
              },
              data: {
                status: nextState.orderStatus
              }
            });

            return transaction.payment.create({
              data: {
                orderId: order.id,
                submittedByUserId: input.submittedByUserId,
                sitePaymentMethodId: sitePaymentMethod.id,
                amountCents: input.amountCents,
                payerHandle,
                externalReference,
                proofAssetKey,
                status: "pending_review",
                submittedAtUtc: now
              },
              include: accountPaymentInclude
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable
          }
        );

        await sendPaymentSubmittedForReviewNotification({
          orderId: payment.orderId,
          buyerEmail: payment.submittedByUser.email,
          listingTitle: payment.order.listing.title
        });

        const adminEmails = await listAdminNotificationEmails();

        for (const adminEmail of adminEmails) {
          await sendAdminPaymentSubmittedNotification({
            paymentId: payment.id,
            orderId: payment.orderId,
            adminEmail,
            buyerEmail: payment.submittedByUser.email,
            listingTitle: payment.order.listing.title,
            paymentMethodLabel: payment.sitePaymentMethod.displayName
          });
        }

        return payment;
      } catch (error) {
        if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
          continue;
        }

        throw error;
      }
    }
  } catch (error) {
    await removeStoredPaymentProof(proofAssetKey);
    throw error;
  }

  throw new Error("Payment submission could not be completed.");
}

export async function reviewPaymentSubmission(input: {
  paymentId: string;
  reviewedByUserId: string;
  decision: "approve" | "reject";
  reviewNotes?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  const paymentSource = await prisma.payment.findUnique({
    where: {
      id: input.paymentId
    },
    select: {
      order: {
        select: {
          source: true
        }
      }
    }
  });

  if (!paymentSource) {
    throw new OrderActionError("order_not_found", 404, "Payment could not be found.");
  }

  if (paymentSource.order.source === "fixed_price_claim") {
    for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
      try {
        const result = await prisma.$transaction(
          async (transaction) => {
            const payment = await transaction.payment.findUnique({
              where: {
                id: input.paymentId
              },
              include: {
                order: {
                  include: {
                    listing: {
                      select: {
                        id: true,
                        title: true,
                        status: true
                      }
                    },
                    buyerUser: {
                      select: {
                        email: true
                      }
                    }
                  }
                }
              }
            });

            if (!payment) {
              throw new OrderActionError("order_not_found", 404, "Payment could not be found.");
            }

            const nextState = resolvePaymentReviewTransition({
              orderStatus: payment.order.status,
              paymentStatus: payment.status,
              decision: input.decision,
              now
            });
            const currentReservation = await findCurrentFixedPriceReservation(transaction, {
              listingId: payment.order.listing.id
            });
            const reservationStillHeld =
              payment.order.listing.status === "sold_pending_payment" &&
              currentReservation?.id === payment.order.id;

            if (input.decision === "approve") {
              const listingStatus = nextState.listingStatus;

              if (!listingStatus) {
                throw new OrderActionError(
                  "payment_review_invalid",
                  409,
                  "Approved fixed-price reservation payments must produce a sold listing state."
                );
              }

              if (!reservationStillHeld) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getFixedPriceReservationReleasedMessage()
                );
              }
            }

            const updatedPayment = await transaction.payment.update({
              where: {
                id: payment.id
              },
              data: {
                status: nextState.paymentStatus,
                reviewedByUserId: input.reviewedByUserId,
                reviewedAtUtc: nextState.reviewedAtUtc,
                reviewNotes: input.reviewNotes?.trim() || null
              },
              include: adminPaymentInclude
            });

            await transaction.order.update({
              where: {
                id: payment.order.id
              },
              data: {
                status: nextState.orderStatus,
                paidAtUtc: nextState.paidAtUtc ?? undefined
              }
            });

            if (input.decision === "approve") {
              const updatedListing = await transaction.listing.updateMany({
                where: {
                  id: payment.order.listing.id,
                  status: "sold_pending_payment"
                },
                data: {
                  status: "paid"
                }
              });

              if (updatedListing.count !== 1) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getFixedPriceReservationReleasedMessage()
                );
              }
            } else if (reservationStillHeld) {
              await transaction.listing.updateMany({
                where: {
                  id: payment.order.listing.id,
                  status: "sold_pending_payment"
                },
                data: {
                  status: "published"
                }
              });
            }

            return {
              ...updatedPayment,
              proofAssetUrl: buildPaymentProofUrl(updatedPayment.id, updatedPayment.proofAssetKey)
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable
          }
        );

        if (input.decision === "approve") {
          await sendOrderPaidNotification({
            orderId: result.order.id,
            buyerEmail: result.order.buyerUser.email,
            listingTitle: result.order.listing.title
          });
        } else {
          await sendPaymentRejectedNotification({
            orderId: result.order.id,
            buyerEmail: result.order.buyerUser.email,
            listingTitle: result.order.listing.title,
            reservationReleased: true
          });
        }

        return result;
      } catch (error) {
        if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("Payment review could not be completed.");
  }

  if (input.decision === "approve") {
    if (paymentSource.order.source === "fixed_price_pay_first") {
      for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
        try {
          const result = await prisma.$transaction(
            async (transaction) => {
              const payment = await transaction.payment.findUnique({
                where: {
                  id: input.paymentId
                },
                include: {
                  order: {
                    include: {
                      listing: {
                        select: {
                          id: true,
                          title: true,
                          status: true
                        }
                      },
                      buyerUser: {
                        select: {
                          email: true
                        }
                      }
                    }
                  }
                }
              });

              if (!payment) {
                throw new OrderActionError("order_not_found", 404, "Payment could not be found.");
              }

              const nextState = resolvePaymentReviewTransition({
                orderStatus: payment.order.status,
                paymentStatus: payment.status,
                decision: input.decision,
                now
              });
              const listingStatus = nextState.listingStatus;

              if (!listingStatus) {
                throw new OrderActionError(
                  "payment_review_invalid",
                  409,
                  "Approved pay-first payments must produce a sold listing state."
                );
              }

              const existingWinner = await findExistingPayFirstWinner(transaction, {
                listingId: payment.order.listing.id,
                excludeOrderId: payment.order.id
              });

              if (payment.order.listing.status !== "published" || existingWinner) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getPayFirstSoldMessage()
                );
              }

              const updatedPayment = await transaction.payment.update({
                where: {
                  id: payment.id
                },
                data: {
                  status: nextState.paymentStatus,
                  reviewedByUserId: input.reviewedByUserId,
                  reviewedAtUtc: nextState.reviewedAtUtc,
                  reviewNotes: input.reviewNotes?.trim() || null
                },
                include: adminPaymentInclude
              });

              await transaction.order.update({
                where: {
                  id: payment.order.id
                },
                data: {
                  status: nextState.orderStatus,
                  paidAtUtc: nextState.paidAtUtc ?? undefined
                }
              });

              const updatedListing = await transaction.listing.updateMany({
                where: {
                  id: payment.order.listing.id,
                  status: "published"
                },
                data: {
                  status: listingStatus
                }
              });

              if (updatedListing.count !== 1) {
                throw new OrderActionError(
                  "listing_unavailable",
                  409,
                  getPayFirstSoldMessage()
                );
              }

              return {
                ...updatedPayment,
                proofAssetUrl: buildPaymentProofUrl(updatedPayment.id, updatedPayment.proofAssetKey)
              };
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable
            }
          );

          await sendOrderPaidNotification({
            orderId: result.order.id,
            buyerEmail: result.order.buyerUser.email,
            listingTitle: result.order.listing.title
          });

          return result;
        } catch (error) {
          if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
            continue;
          }

          throw error;
        }
      }

      throw new Error("Payment review could not be completed.");
    }
  }

  return prisma.$transaction(async (transaction) => {
    const payment = await transaction.payment.findUnique({
      where: {
        id: input.paymentId
      },
      include: {
        order: {
          include: {
            listing: {
              select: {
                id: true,
                title: true
              }
            },
            buyerUser: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      throw new OrderActionError("order_not_found", 404, "Payment could not be found.");
    }

    const nextState = resolvePaymentReviewTransition({
      orderStatus: payment.order.status,
      paymentStatus: payment.status,
      decision: input.decision,
      now
    });

    const updatedPayment = await transaction.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: nextState.paymentStatus,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAtUtc: nextState.reviewedAtUtc,
        reviewNotes: input.reviewNotes?.trim() || null
      },
      include: adminPaymentInclude
    });

    await transaction.order.update({
      where: {
        id: payment.order.id
      },
      data: {
        status: nextState.orderStatus,
        paidAtUtc: nextState.paidAtUtc ?? undefined
      }
    });

    if (nextState.listingStatus) {
      await transaction.listing.update({
        where: {
          id: payment.order.listing.id
        },
        data: {
          status: nextState.listingStatus
        }
      });
    }

    const result = {
      ...updatedPayment,
      proofAssetUrl: buildPaymentProofUrl(updatedPayment.id, updatedPayment.proofAssetKey)
    };

    if (input.decision === "approve") {
      await sendOrderPaidNotification({
        orderId: result.order.id,
        buyerEmail: result.order.buyerUser.email,
        listingTitle: result.order.listing.title
      });
    } else {
      await sendPaymentRejectedNotification({
        orderId: result.order.id,
        buyerEmail: result.order.buyerUser.email,
        listingTitle: result.order.listing.title
      });
    }

    return result;
  });
}

export async function listAdminPayments() {
  const payments = await prisma.payment.findMany({
    include: adminPaymentInclude,
    orderBy: [{ updatedAtUtc: "desc" }]
  });

  return payments.map((payment) => ({
    ...payment,
    proofAssetUrl: buildPaymentProofUrl(payment.id, payment.proofAssetKey)
  }));
}

export async function getAdminPaymentById(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: {
      id: paymentId
    },
    include: adminPaymentInclude
  });

  return {
    ...payment,
    proofAssetUrl: buildPaymentProofUrl(payment.id, payment.proofAssetKey)
  };
}

export async function getAccountPaymentById(input: {
  paymentId: string;
  userId: string;
}) {
  const payment = await prisma.payment.findFirstOrThrow({
    where: {
      id: input.paymentId,
      order: {
        buyerUserId: input.userId
      }
    },
    include: accountPaymentInclude
  });

  return {
    ...payment,
    proofAssetUrl: buildPaymentProofUrl(payment.id, payment.proofAssetKey)
  };
}
