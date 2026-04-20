import { describe, expect, it } from "vitest";

import {
  createSessionCookieValue,
  verifySessionCookieValue
} from "../src/lib/auth/session-cookie.js";

describe("session cookie signing", () => {
  it("round-trips a signed session payload", async () => {
    const cookieValue = await createSessionCookieValue(
      {
        sessionToken: "raw-token",
        userId: "user_123",
        role: "bidder",
        emailVerified: false,
        expiresAtUnix: Math.floor(Date.now() / 1000) + 3600
      },
      "test-secret"
    );

    await expect(verifySessionCookieValue(cookieValue, "test-secret")).resolves.toEqual({
      sessionToken: "raw-token",
      userId: "user_123",
      role: "bidder",
      emailVerified: false,
      expiresAtUnix: expect.any(Number)
    });
  });

  it("rejects tampered session cookies", async () => {
    const cookieValue = await createSessionCookieValue(
      {
        sessionToken: "raw-token",
        userId: "user_123",
        role: "admin",
        emailVerified: true,
        expiresAtUnix: Math.floor(Date.now() / 1000) + 3600
      },
      "test-secret"
    );

    const tampered = `${cookieValue}tampered`;

    await expect(verifySessionCookieValue(tampered, "test-secret")).resolves.toBeNull();
  });
});
