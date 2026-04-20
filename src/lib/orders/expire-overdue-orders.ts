import { prisma } from "@/lib/prisma";
import { sendOrderPaymentOverdueNotification } from "@/lib/notifications/workflow-events";

import type { DomainJobInput, DomainJobResult } from "../jobs/types";
import { resolveOverdueOrder } from "./rules";

export type ExpireOverdueOrderCandidate = {
  orderId: string;
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
      status: true,
      paymentDeadlineAtUtc: true,
      buyerUser: {
        select: {
          email: true
        }
      },
      listing: {
        select: {
          title: true
        }
      }
    }
  });

  return orders.map((order) => ({
    orderId: order.id,
    orderStatus: order.status,
    paymentDeadlineAtUtc: order.paymentDeadlineAtUtc,
    buyerEmail: order.buyerUser.email,
    listingTitle: order.listing.title
  }));
}

export async function expireOverdueOrders(
  input: ExpireOverdueOrdersInput = {}
): Promise<DomainJobResult> {
  const now = input.now ?? new Date();
  const candidates = input.candidates ?? (await listOverdueOrderCandidates(now));
  let processedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
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

    if (updatedOrder.count === 1) {
      processedCount += 1;

      if (candidate.buyerEmail && candidate.listingTitle) {
        await sendOrderPaymentOverdueNotification({
          orderId: candidate.orderId,
          buyerEmail: candidate.buyerEmail,
          listingTitle: candidate.listingTitle
        });
      }
    } else {
      skippedCount += 1;
    }
  }

  return {
    jobName: "orders.expireOverdue",
    status: "completed",
    dryRun: input.dryRun ?? false,
    processedCount,
    skippedCount,
    timestampUtc: now.toISOString(),
    notes: [
      `Marked ${processedCount} order(s) as payment overdue.`,
      `Skipped ${skippedCount} order(s) that no longer required expiry.`
    ]
  };
}
