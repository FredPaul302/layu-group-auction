import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionCookieMocks = vi.hoisted(() => ({
  verifySessionCookieValue: vi.fn()
}));

const edgeEnvMocks = vi.hoisted(() => ({
  getEdgeAppUrl: vi.fn(() => "https://auction.example.com"),
  getEdgeAuthCookieName: vi.fn(() => "layu_session"),
  getEdgeAuthSecret: vi.fn(() => "12345678901234567890123456789012")
}));

vi.mock("@/lib/auth/session-cookie", () => sessionCookieMocks);
vi.mock("@/lib/config/edge-env", () => edgeEnvMocks);

import { middleware } from "../middleware.js";

describe("middleware auth redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    edgeEnvMocks.getEdgeAppUrl.mockReturnValue("https://auction.example.com");
  });

  it("redirects signed-in users away from auth pages with the configured app URL", async () => {
    sessionCookieMocks.verifySessionCookieValue.mockResolvedValue({
      emailVerified: true,
      role: "bidder",
      userId: "user_1"
    });

    const response = await middleware(
      new NextRequest("http://localhost:3000/auth/login", {
        headers: {
          Cookie: "layu_session=signed-session"
        }
      })
    );

    expect(response.headers.get("location")).toBe("https://auction.example.com/account");
  });

  it("redirects anonymous account visits to login with the configured app URL", async () => {
    sessionCookieMocks.verifySessionCookieValue.mockResolvedValue(null);

    const response = await middleware(
      new NextRequest("http://localhost:3000/account?tab=bids")
    );

    expect(response.headers.get("location")).toBe(
      "https://auction.example.com/auth/login?next=%2Faccount%3Ftab%3Dbids"
    );
  });
});
