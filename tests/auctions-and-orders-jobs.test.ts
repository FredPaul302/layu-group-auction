import { describe, expect, it } from "vitest";

import { closeExpiredAuctions, expireRunnerUpOffers } from "../src/lib/auctions/index.js";
import { expireOverdueOrders } from "../src/lib/orders/index.js";

describe("domain job stubs", () => {
  it("returns a completed result for closing expired auctions", async () => {
    const result = await closeExpiredAuctions({
      dryRun: true,
      now: new Date("2026-04-20T00:00:00.000Z"),
      paymentWindowHours: 48,
      candidates: []
    });

    expect(result.jobName).toBe("auctions.closeExpired");
    expect(result.status).toBe("completed");
    expect(result.dryRun).toBe(true);
    expect(result.processedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("returns a completed result for overdue orders", async () => {
    const result = await expireOverdueOrders({
      dryRun: true,
      now: new Date("2026-04-20T00:00:00.000Z"),
      candidates: []
    });

    expect(result.jobName).toBe("orders.expireOverdue");
    expect(result.status).toBe("completed");
    expect(result.processedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("returns a completed result for runner-up offer expiry", async () => {
    const result = await expireRunnerUpOffers({
      dryRun: true,
      now: new Date("2026-04-20T00:00:00.000Z"),
      candidates: []
    });

    expect(result.jobName).toBe("offers.expireRunnerUp");
    expect(result.status).toBe("completed");
  });
});
