import { randomUUID } from "node:crypto";

import type { EmailAdapter, EmailMessage, EmailReceipt } from "./email-adapter";

type WebhookEmailAdapterOptions = {
  fromAddress: string;
  replyToAddress?: string | null;
  webhookBearerToken?: string | null;
  webhookUrl: string;
};

export class WebhookEmailAdapter implements EmailAdapter {
  constructor(private readonly options: WebhookEmailAdapterOptions) {}

  async send(message: EmailMessage): Promise<EmailReceipt> {
    const response = await fetch(this.options.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.options.webhookBearerToken
          ? {
              Authorization: `Bearer ${this.options.webhookBearerToken}`
            }
          : {})
      },
      body: JSON.stringify({
        to: message.to,
        subject: message.subject,
        text: message.text,
        from: message.from ?? this.options.fromAddress,
        replyTo: message.replyTo ?? this.options.replyToAddress ?? null
      })
    });

    if (!response.ok) {
      throw new Error(
        `Webhook email delivery failed with ${response.status} ${response.statusText}.`
      );
    }

    let messageId = response.headers.get("x-message-id") ?? null;
    const deliveredAtUtc = new Date().toISOString();

    try {
      const payload = (await response.json()) as { messageId?: string } | null;
      messageId = payload?.messageId ?? messageId;
    } catch {
      // Ignore non-JSON responses from generic email webhooks.
    }

    return {
      messageId: messageId ?? `webhook-${randomUUID()}`,
      deliveredAtUtc
    };
  }
}
