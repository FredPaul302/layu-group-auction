import { describe, expect, it } from "vitest";

import { buildAuctionRelistSchedule } from "../src/lib/catalog/relist.js";

describe("listing relist rules", () => {
  it("preserves the original auction duration when relisting with the same settings", () => {
    const schedule = buildAuctionRelistSchedule({
      startAtUtc: new Date("2026-04-01T12:00:00.000Z"),
      endAtUtc: new Date("2026-04-03T12:00:00.000Z"),
      now: new Date("2026-04-20T15:30:00.000Z")
    });

    expect(schedule.startAtUtc.toISOString()).toBe("2026-04-20T15:30:00.000Z");
    expect(schedule.endAtUtc.toISOString()).toBe("2026-04-22T15:30:00.000Z");
  });

  it("applies a minimum one-minute duration if the original auction window was invalid", () => {
    const schedule = buildAuctionRelistSchedule({
      startAtUtc: new Date("2026-04-03T12:00:00.000Z"),
      endAtUtc: new Date("2026-04-03T11:59:00.000Z"),
      now: new Date("2026-04-20T15:30:00.000Z")
    });

    expect(schedule.startAtUtc.toISOString()).toBe("2026-04-20T15:30:00.000Z");
    expect(schedule.endAtUtc.toISOString()).toBe("2026-04-20T15:31:00.000Z");
  });
});
