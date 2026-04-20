import { describe, expect, it } from "vitest";

import {
  canParticipateInCommerce,
  hasVerifiedEmail,
  isAdmin,
  isAuthenticated
} from "../src/lib/permissions/index.js";

describe("permission helpers", () => {
  it("recognizes authenticated and admin users", () => {
    const adminUser = {
      id: "user_1",
      role: "admin" as const,
      emailVerifiedAtUtc: new Date().toISOString()
    };

    expect(isAuthenticated(adminUser)).toBe(true);
    expect(isAdmin(adminUser)).toBe(true);
    expect(hasVerifiedEmail(adminUser)).toBe(true);
  });

  it("keeps commerce participation disabled until secondary verification exists", () => {
    const bidderUser = {
      id: "user_2",
      role: "bidder" as const,
      emailVerifiedAtUtc: new Date().toISOString(),
      bidderProfile: {
        isBlocked: false,
        maxBidTier: "tier_20" as const
      }
    };

    expect(canParticipateInCommerce(bidderUser)).toBe(false);
  });
});
