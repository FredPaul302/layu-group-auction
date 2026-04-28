import type { EmailAdapter, EmailMessage, EmailReceipt } from "./email-adapter";

export class ConsoleEmailAdapter implements EmailAdapter {
  async send(message: EmailMessage): Promise<EmailReceipt> {
    const receipt: EmailReceipt = {
      messageId: `console-${Date.now()}`,
      deliveredAtUtc: new Date().toISOString()
    };

    console.info(
      JSON.stringify(
        {
          email: message,
          receipt
        },
        null,
        2
      )
    );

    return receipt;
  }
}
