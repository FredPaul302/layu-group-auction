import { describe, expect, it } from "vitest";

import { closeExpiredAuctions, expireRunnerUpOffers } from "../src/lib/auctions/index.js";
import { expireOverdueOrders } from "../src/lib/orders/index.js";

describe("domain job stubs", () => {
  it("returns a stub result for closing expired auctions", async () => {
    const result = await closeExpiredAuctions({ dryRun: true });

    expect(result.jobName).toBe("auctions.closeExpired");
    expect(result.status).toBe("stub");
    expect(result.dryRun).toBe(true);
    expect(result.notes[0]).toContain("Scaffolded job only");
  });

  it("returns a stub result for overdue orders", async () => {
    const result = await expireOverdueOrders();

    expect(result.jobName).toBe("orders.expireOverdue");
    expect(result.processedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("returns a stub result for runner-up offer expiry", async () => {
    const result = await expireRunnerUpOffers();

    expect(result.jobName).toBe("offers.expireRunnerUp");
    expect(result.status).toBe("stub");
  });
});
