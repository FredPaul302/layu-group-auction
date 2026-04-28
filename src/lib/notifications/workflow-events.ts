import { getAppEnv } from "@/lib/config/app-env";
import { sendEmail } from "@/lib/email";

function buildOrderNumberLabel(orderId: string) {
  return `ORD-${orderId.slice(-8).toUpperCase()}`;
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getAppEnv().app.url).toString();
}

async function sendWorkflowNotification(input: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    await sendEmail(input);
  } catch {
    // Failures are logged by the shared email boundary so workflow transitions can continue.
  }
}

export async function sendFixedPriceReservationCreatedNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
  paymentDeadlineAtUtc: Date;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} reservation created`,
    text: [
      `Your fixed-price reservation for "${input.listingTitle}" is active.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `Reserved until: ${input.paymentDeadlineAtUtc.toISOString()}`,
      "Submit payment before the deadline or the listing will be released.",
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendPaymentSubmittedForReviewNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment submitted`,
    text: [
      `We received your payment submission for "${input.listingTitle}".`,
      "",
      "The submission is now waiting for manual admin review.",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendAdminPaymentSubmittedNotification(input: {
  paymentId: string;
  orderId: string;
  adminEmail: string;
  buyerEmail: string;
  listingTitle: string;
  paymentMethodLabel: string;
}) {
  await sendWorkflowNotification({
    to: input.adminEmail,
    subject: `Payment review required for ${buildOrderNumberLabel(input.orderId)}`,
    text: [
      `A manual payment submission is ready for review for "${input.listingTitle}".`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `Buyer: ${input.buyerEmail}`,
      `Method: ${input.paymentMethodLabel}`,
      `Review payment: ${buildAbsoluteUrl(`/admin/payments/${input.paymentId}`)}`
    ].join("\n")
  });
}

export async function sendOrderPaidNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment confirmed`,
    text: [
      `Payment for "${input.listingTitle}" has been confirmed.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendOrderPaymentOverdueNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment overdue`,
    text: [
      `Payment for "${input.listingTitle}" is now overdue.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `Review order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendPaymentRejectedNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
  reservationReleased?: boolean;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment rejected`,
    text: [
      `The payment submission for "${input.listingTitle}" was rejected.`,
      "",
      input.reservationReleased
        ? "The reservation has been released."
        : "You can review the order and submit another payment before the deadline if it remains active.",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendFixedPriceReservationReleasedNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} reservation released`,
    text: [
      `Your reservation for "${input.listingTitle}" has expired and the listing has been released.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `View purchases: ${buildAbsoluteUrl("/account/purchases")}`
    ].join("\n")
  });
}

export async function sendRunnerUpOfferSentNotification(input: {
  listingTitle: string;
  offeredToEmail: string;
  expiresAtUtc: Date;
}) {
  await sendWorkflowNotification({
    to: input.offeredToEmail,
    subject: `Runner-up offer for "${input.listingTitle}"`,
    text: [
      `A manual runner-up offer is now available for "${input.listingTitle}".`,
      "",
      `Expires at: ${input.expiresAtUtc.toISOString()}`,
      `Review offer: ${buildAbsoluteUrl("/account/offers")}`
    ].join("\n")
  });
}

export async function sendAuctionWonPaymentInstructionsNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
  paymentDeadlineAtUtc: Date;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `You won "${input.listingTitle}"`,
    text: [
      `You won the auction for "${input.listingTitle}".`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `Payment due by: ${input.paymentDeadlineAtUtc.toISOString()}`,
      "Submit your external payment details from the order page for manual review.",
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendOrderReadyForFulfillmentNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} ready for fulfillment`,
    text: [
      `"${input.listingTitle}" is now ready for fulfillment.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `View order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendOrderCompletedNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} completed`,
    text: [
      `Order ${buildOrderNumberLabel(input.orderId)} for "${input.listingTitle}" has been completed.`,
      "",
      `View order history: ${buildAbsoluteUrl("/account/purchases")}`
    ].join("\n")
  });
}
