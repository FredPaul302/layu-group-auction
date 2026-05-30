import { randomUUID } from "node:crypto";

import {
  SendEmailCommand,
  SESv2Client,
  type SESv2ClientConfig
} from "@aws-sdk/client-sesv2";

import type { EmailAdapter, EmailMessage, EmailReceipt } from "./email-adapter";

type SesEmailClient = Pick<SESv2Client, "send">;

type SesEmailAdapterOptions = {
  fromAddress: string;
  region: string;
  replyToAddress?: string | null;
  client?: SesEmailClient;
};

export class SesEmailAdapter implements EmailAdapter {
  private readonly client: SesEmailClient;

  constructor(private readonly options: SesEmailAdapterOptions) {
    this.client =
      options.client ??
      new SESv2Client({
        region: options.region
      } satisfies SESv2ClientConfig);
  }

  async send(message: EmailMessage): Promise<EmailReceipt> {
    const fromAddress = message.from ?? this.options.fromAddress;
    const replyToAddress = message.replyTo ?? this.options.replyToAddress ?? null;
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: fromAddress,
        Destination: {
          ToAddresses: [message.to]
        },
        Content: {
          Simple: {
            Subject: {
              Data: message.subject,
              Charset: "UTF-8"
            },
            Body: {
              Text: {
                Data: message.text,
                Charset: "UTF-8"
              }
            }
          }
        },
        ...(replyToAddress
          ? {
              ReplyToAddresses: [replyToAddress]
            }
          : {})
      })
    );

    return {
      messageId: result.MessageId ?? `ses-${randomUUID()}`,
      deliveredAtUtc: new Date().toISOString()
    };
  }
}
