import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleNotificationAdapter } from "../src/lib/notifications/index.js";

describe("ConsoleNotificationAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a notification payload and returns a receipt", async () => {
    const adapter = new ConsoleNotificationAdapter();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const receipt = await adapter.send({
      subject: "Payment received",
      body: "Manual payment submission is ready for review.",
      channel: "ops",
      to: "admin@example.com"
    });

    expect(receipt.messageId).toContain("dev-");
    expect(receipt.deliveredAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });
});
