import { PaymentMethodCode, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStorageAdapter, getStoredAssetPublicUrl } from "@/lib/storage";
import { sendOrderPaidNotification } from "@/lib/notifications/workflow-events";

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

function buildPublicProofUrl(proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return null;
  }

  return getStoredAssetPublicUrl(proofAssetKey);
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

  const proofAssetKey = await storePaymentProofScreenshot(input.orderId, input.screenshotFile);

  return prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findFirst({
      where: {
        id: input.orderId,
        buyerUserId: input.submittedByUserId
      },
      include: {
        pickupEvent: true,
        listing: {
          select: {
            id: true,
            fulfillmentMode: true
          }
        }
      }
    });

    if (!order) {
      throw new OrderActionError("order_not_found", 404, "Order could not be found.");
    }

    const nextState = resolvePaymentSubmissionStatus({
      orderStatus: order.status,
      paymentDeadlineAtUtc: order.paymentDeadlineAtUtc,
      now,
      fulfillmentSelectionComplete: isFulfillmentSelectionComplete({
        selectedFulfillmentMode: order.selectedFulfillmentMode,
        pickupEventId: order.pickupEventId,
        shippingAddressText: order.shippingAddressText
      })
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
  });
}

export async function reviewPaymentSubmission(input: {
  paymentId: string;
  reviewedByUserId: string;
  decision: "approve" | "reject";
  reviewNotes?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

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
      proofAssetUrl: buildPublicProofUrl(updatedPayment.proofAssetKey)
    };

    if (input.decision === "approve") {
      await sendOrderPaidNotification({
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
    proofAssetUrl: buildPublicProofUrl(payment.proofAssetKey)
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
    proofAssetUrl: buildPublicProofUrl(payment.proofAssetKey)
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
    proofAssetUrl: buildPublicProofUrl(payment.proofAssetKey)
  };
}
