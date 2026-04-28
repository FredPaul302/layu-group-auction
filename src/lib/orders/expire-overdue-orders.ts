import { prisma } from "@/lib/prisma";
import {
  sendFixedPriceReservationReleasedNotification,
  sendOrderPaymentOverdueNotification
} from "@/lib/notifications/workflow-events";
import { logStructuredEvent, serializeError } from "@/lib/ops/structured-logging";

import type { DomainJobInput, DomainJobResult } from "../jobs/types";
import { resolveOverdueOrder } from "./rules";

export type ExpireOverdueOrderCandidate = {
  orderId: string;
  orderSource: "auction_win" | "fixed_price_claim" | "fixed_price_pay_first" | "runner_up_offer";
  orderStatus:
    | "awaiting_payment"
    | "payment_submitted"
    | "payment_rejected"
    | "payment_overdue"
    | "paid"
    | "ready_for_fulfillment"
    | "fulfilled"
    | "completed"
    | "cancelled"
    | "archived";
  listingId: string;
  listingStatus:
    | "draft"
    | "published"
    | "ended"
    | "sold_pending_payment"
    | "paid"
    | "ready_for_fulfillment"
    | "fulfilled"
    | "unsold"
    | "archived";
  paymentDeadlineAtUtc: Date;
  buyerEmail?: string | null;
  listingTitle?: string | null;
};

export type ExpireOverdueOrdersInput = DomainJobInput & {
  now?: Date;
  candidates?: ExpireOverdueOrderCandidate[];
};

async function listOverdueOrderCandidates(now: Date): Promise<ExpireOverdueOrderCandidate[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ["awaiting_payment", "payment_submitted", "payment_rejected"]
      },
      paymentDeadlineAtUtc: {
        lt: now
      }
    },
    select: {
      id: true,
      source: true,
      status: true,
      paymentDeadlineAtUtc: true,
      buyerUser: {
        select: {
          email: true
        }
      },
      listing: {
        select: {
          id: true,
          status: true,
          title: true
        }
      }
    }
  });

  return orders.map((order) => ({
    orderId: order.id,
    orderSource: order.source,
    orderStatus: order.status,
    listingId: order.listing.id,
    listingStatus: order.listing.status,
    paymentDeadlineAtUtc: order.paymentDeadlineAtUtc,
    buyerEmail: order.buyerUser.email,
    listingTitle: order.listing.title
  }));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown job error.";
}

export async function expireOverdueOrders(
  input: ExpireOverdueOrdersInput = {}
): Promise<DomainJobResult> {
  const now = input.now ?? new Date();
  const startedAtUtc = new Date().toISOString();
  const candidates = input.candidates ?? (await listOverdueOrderCandidates(now));
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let paymentOverdueCount = 0;
  let releasedReservationCount = 0;
  const notes: string[] = [];

  for (const candidate of candidates) {
    try {
      const resolution = resolveOverdueOrder({
        orderStatus: candidate.orderStatus,
        paymentDeadlineAtUtc: candidate.paymentDeadlineAtUtc,
        now
      });

      if (!resolution.shouldExpire) {
        skippedCount += 1;
        continue;
      }

      if (input.dryRun || input.candidates) {
        processedCount += 1;
        paymentOverdueCount += 1;

        if (candidate.orderSource === "fixed_price_claim") {
          releasedReservationCount += 1;
        }

        continue;
      }

      const updatedOrder = await prisma.order.updateMany({
        where: {
          id: candidate.orderId,
          status: candidate.orderStatus
        },
        data: {
          status: resolution.nextStatus
        }
      });

      if (updatedOrder.count !== 1) {
        skippedCount += 1;
        continue;
      }

      processedCount += 1;
      paymentOverdueCount += 1;

      if (candidate.orderSource === "fixed_price_claim") {
        await prisma.listing.updateMany({
          where: {
            id: candidate.listingId,
            status: "sold_pending_payment"
          },
          data: {
            status: "published"
          }
        });

        releasedReservationCount += 1;
      }

      logStructuredEvent("info", "order_payment_expired", {
        orderId: candidate.orderId,
        orderSource: candidate.orderSource,
        listingId: candidate.listingId,
        listingStatus: candidate.listingStatus,
        nextOrderStatus: resolution.nextStatus,
        reservationReleased: candidate.orderSource === "fixed_price_claim"
      });

      if (candidate.buyerEmail && candidate.listingTitle) {
        if (candidate.orderSource === "fixed_price_claim") {
          await sendFixedPriceReservationReleasedNotification({
            orderId: candidate.orderId,
            buyerEmail: candidate.buyerEmail,
            listingTitle: candidate.listingTitle
          });
        } else {
          await sendOrderPaymentOverdueNotification({
            orderId: candidate.orderId,
            buyerEmail: candidate.buyerEmail,
            listingTitle: candidate.listingTitle
          });
        }
      }
    } catch (error) {
      errorCount += 1;

      const errorMessage = getErrorMessage(error);

      notes.push(`Order ${candidate.orderId} failed overdue processing: ${errorMessage}`);
      logStructuredEvent("error", "order_payment_expiry_failed", {
        orderId: candidate.orderId,
        error: serializeError(error)
      });
    }
  }

  const completedAtUtc = new Date().toISOString();

  return {
    jobName: "orders.expireOverdue",
    status: "completed",
    dryRun: input.dryRun ?? false,
    processedCount,
    skippedCount,
    errorCount,
    startedAtUtc,
    completedAtUtc,
    timestampUtc: completedAtUtc,
    metrics: {
      paymentOverdueCount,
      releasedReservationCount
    },
    notes: [
      `Marked ${processedCount} order(s) as payment overdue.`,
      `Released ${releasedReservationCount} fixed-price reservation(s).`,
      `Skipped ${skippedCount} order(s) that no longer required expiry.`,
      `Encountered ${errorCount} error(s).`,
      ...notes
    ]
  };
}
