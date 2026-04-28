import { afterEach, describe, expect, it, vi } from "vitest";

import { WebhookEmailAdapter } from "../src/lib/email/index.js";

describe("WebhookEmailAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a message payload to the configured webhook endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: "mail_123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      );
    const adapter = new WebhookEmailAdapter({
      fromAddress: "ops@auction.example.com",
      webhookUrl: "https://mail-bridge.example.com/send"
    });

    const receipt = await adapter.send({
      to: "buyer@example.com",
      subject: "Verify your email",
      text: "Hello there"
    });

    expect(receipt.messageId).toBe("mail_123");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mail-bridge.example.com/send",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
