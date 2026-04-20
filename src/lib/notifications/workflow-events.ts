import { getAppEnv } from "@/lib/config/app-env";

import { ConsoleNotificationAdapter } from "./console-notification-adapter";

const notificationAdapter = new ConsoleNotificationAdapter();

function buildOrderNumberLabel(orderId: string) {
  return `ORD-${orderId.slice(-8).toUpperCase()}`;
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getAppEnv().appUrl).toString();
}

async function sendWorkflowNotification(input: {
  channel: "email" | "ops" | "internal";
  to: string;
  subject: string;
  body: string;
}) {
  try {
    await notificationAdapter.send(input);
  } catch (error) {
    console.error("Workflow notification failed.", error);
  }
}

export async function sendOrderPaidNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    channel: "email",
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment confirmed`,
    body: [
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
    channel: "email",
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} payment overdue`,
    body: [
      `Payment for "${input.listingTitle}" is now overdue.`,
      "",
      `Order: ${buildOrderNumberLabel(input.orderId)}`,
      `Review order: ${buildAbsoluteUrl(`/account/orders/${input.orderId}/payment`)}`
    ].join("\n")
  });
}

export async function sendRunnerUpOfferSentNotification(input: {
  listingTitle: string;
  offeredToEmail: string;
  expiresAtUtc: Date;
}) {
  await sendWorkflowNotification({
    channel: "email",
    to: input.offeredToEmail,
    subject: `Runner-up offer for "${input.listingTitle}"`,
    body: [
      `A manual runner-up offer is now available for "${input.listingTitle}".`,
      "",
      `Expires at: ${input.expiresAtUtc.toISOString()}`,
      `Review offer: ${buildAbsoluteUrl("/account/offers")}`
    ].join("\n")
  });
}

export async function sendOrderReadyForFulfillmentNotification(input: {
  orderId: string;
  buyerEmail: string;
  listingTitle: string;
}) {
  await sendWorkflowNotification({
    channel: "email",
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} ready for fulfillment`,
    body: [
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
    channel: "email",
    to: input.buyerEmail,
    subject: `${buildOrderNumberLabel(input.orderId)} completed`,
    body: [
      `Order ${buildOrderNumberLabel(input.orderId)} for "${input.listingTitle}" has been completed.`,
      "",
      `View order history: ${buildAbsoluteUrl("/account/purchases")}`
    ].join("\n")
  });
}
