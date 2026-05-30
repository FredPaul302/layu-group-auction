import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it, vi } from "vitest";

import { SesEmailAdapter } from "../src/lib/email/index.js";

describe("SesEmailAdapter", () => {
  it("sends a simple text email through SES v2", async () => {
    const send = vi.fn().mockResolvedValue({
      MessageId: "ses-message-123"
    });
    const adapter = new SesEmailAdapter({
      fromAddress: "no-reply@layu.llc",
      region: "us-east-1",
      replyToAddress: "support@layu.llc",
      client: {
        send
      }
    });

    const receipt = await adapter.send({
      to: "buyer@example.com",
      subject: "Verify your email",
      text: "Hello there"
    });

    expect(receipt.messageId).toBe("ses-message-123");
    expect(send).toHaveBeenCalledWith(expect.any(SendEmailCommand));
    expect(send.mock.calls[0]?.[0].input).toEqual({
      FromEmailAddress: "no-reply@layu.llc",
      Destination: {
        ToAddresses: ["buyer@example.com"]
      },
      Content: {
        Simple: {
          Subject: {
            Data: "Verify your email",
            Charset: "UTF-8"
          },
          Body: {
            Text: {
              Data: "Hello there",
              Charset: "UTF-8"
            }
          }
        }
      },
      ReplyToAddresses: ["support@layu.llc"]
    });
  });

  it("lets individual messages override default from and reply-to addresses", async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = new SesEmailAdapter({
      fromAddress: "no-reply@layu.llc",
      region: "us-east-1",
      replyToAddress: "support@layu.llc",
      client: {
        send
      }
    });

    const receipt = await adapter.send({
      to: "buyer@example.com",
      subject: "Auction update",
      text: "Your item is ready.",
      from: "ops@layu.llc",
      replyTo: "help@layu.llc"
    });

    expect(receipt.messageId).toMatch(/^ses-/u);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      FromEmailAddress: "ops@layu.llc",
      ReplyToAddresses: ["help@layu.llc"]
    });
  });
});
