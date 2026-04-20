import type {
  NotificationAdapter,
  NotificationMessage,
  NotificationReceipt
} from "./notification-adapter";

export class ConsoleNotificationAdapter implements NotificationAdapter {
  async send(message: NotificationMessage): Promise<NotificationReceipt> {
    const receipt: NotificationReceipt = {
      messageId: `dev-${Date.now()}`,
      deliveredAtUtc: new Date().toISOString()
    };

    console.info(
      JSON.stringify(
        {
          notification: message,
          receipt
        },
        null,
        2
      )
    );

    return receipt;
  }
}
