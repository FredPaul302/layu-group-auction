export type NotificationMessage = {
  subject: string;
  body: string;
  channel: "email" | "ops" | "internal";
  to: string;
};

export type NotificationReceipt = {
  messageId: string;
  deliveredAtUtc: string;
};

export interface NotificationAdapter {
  send(message: NotificationMessage): Promise<NotificationReceipt>;
}
