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

const serverAuthMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  findSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  })
}));

vi.mock("@/lib/auth/session-cookie", () => sessionCookieMocks);
vi.mock("@/lib/config/edge-env", () => edgeEnvMocks);
vi.mock("next/headers", () => ({ cookies: serverAuthMocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: serverAuthMocks.redirect }));
vi.mock("@/lib/prisma", () => ({
  prisma: { session: { findUnique: serverAuthMocks.findSession } }
}));
vi.mock("@/lib/auth/config", () => ({
  getAuthCookieName: () => "layu_session",
  getAuthSecret: () => "12345678901234567890123456789012"
}));
vi.mock("@/lib/auth/email", () => ({
  sendEmailVerificationMessage: vi.fn(),
  sendPasswordResetMessage: vi.fn()
}));

import { middleware } from "../middleware.js";
import AdminLayout from "../src/app/(admin)/admin/layout.js";

function signedAdminRequest() {
  return new NextRequest("http://localhost:3000/admin/listings?status=saved", {
    headers: { Cookie: "layu_session=signed-session" }
  });
}

function mockServerSession(role: "admin" | "bidder") {
  serverAuthMocks.cookies.mockResolvedValue({
    get: () => ({ value: "signed-session" })
  });
  serverAuthMocks.findSession.mockResolvedValue({
    userId: "user_1",
    expiresAtUtc: new Date(Date.now() + 60_000),
    user: { id: "user_1", role, email: "user@example.test" }
  });
}

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

  it("keeps anonymous admin visits protected and preserves their destination", async () => {
    const response = await middleware(
      new NextRequest("http://localhost:3000/admin/listings?status=saved")
    );

    expect(response.headers.get("location")).toBe(
      "https://auction.example.com/auth/login?next=%2Fadmin%2Flistings%3Fstatus%3Dsaved"
    );
    expect(sessionCookieMocks.verifySessionCookieValue).not.toHaveBeenCalled();
  });

  it("rejects an invalid session cookie on admin routes", async () => {
    sessionCookieMocks.verifySessionCookieValue.mockResolvedValue(null);

    const response = await middleware(signedAdminRequest());

    expect(response.headers.get("location")).toContain("/auth/login?next=");
  });

  it("lets a promoted user with a bidder cookie reach the database-backed admin guard", async () => {
    sessionCookieMocks.verifySessionCookieValue.mockResolvedValue({
      emailVerified: true,
      role: "bidder",
      sessionToken: "session-token",
      userId: "user_1"
    });
    mockServerSession("admin");

    const response = await middleware(signedAdminRequest());

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    await expect(AdminLayout({ children: null })).resolves.toBeTruthy();
    expect(serverAuthMocks.findSession).toHaveBeenCalledTimes(1);
    expect(serverAuthMocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["bidder", "admin"])(
    "denies a current bidder at the admin layout even when the cookie role is %s",
    async (cookieRole) => {
      sessionCookieMocks.verifySessionCookieValue.mockResolvedValue({
        emailVerified: true,
        role: cookieRole,
        sessionToken: "session-token",
        userId: "user_1"
      });
      mockServerSession("bidder");

      const response = await middleware(signedAdminRequest());

      expect(response.headers.get("x-middleware-next")).toBe("1");
      await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/account");
      expect(serverAuthMocks.findSession).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects a revoked session at the admin layout", async () => {
    sessionCookieMocks.verifySessionCookieValue.mockResolvedValue({
      emailVerified: true,
      role: "admin",
      sessionToken: "session-token",
      userId: "user_1"
    });
    mockServerSession("admin");
    serverAuthMocks.findSession.mockResolvedValue(null);

    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });
});
