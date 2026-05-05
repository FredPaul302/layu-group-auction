import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const permissionsMocks = vi.hoisted(() => ({
  hasVerifiedEmail: vi.fn()
}));

const verificationServiceMocks = vi.hoisted(() => ({
  startDiditVerificationFlow: vi.fn()
}));

const appEnvMocks = vi.hoisted(() => ({
  getAppEnv: vi.fn(() => ({
    app: {
      url: "http://localhost:3000"
    }
  }))
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/permissions", () => permissionsMocks);
vi.mock("@/lib/verification/service", () => verificationServiceMocks);
vi.mock("@/lib/config/app-env", () => appEnvMocks);

import { POST } from "../src/app/api/verifications/didit/start/route.js";

function buildRequest(headers?: HeadersInit) {
  return new NextRequest("http://localhost:3000/api/verifications/didit/start", {
    headers,
    method: "POST"
  });
}

describe("Didit start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      emailVerifiedAtUtc: new Date("2026-04-20T00:00:00.000Z"),
      id: "user_1"
    });
    permissionsMocks.hasVerifiedEmail.mockReturnValue(true);
    verificationServiceMocks.startDiditVerificationFlow.mockResolvedValue({
      redirectUrl: "https://verify.didit.me/session/didit_session_1",
      status: "redirect"
    });
  });

  it("rejects foreign origins before auth or service work", async () => {
    const response = await POST(
      buildRequest({
        Origin: "https://evil.example"
      })
    );

    expect(response.status).toBe(403);
    expect(authMocks.getCurrentUserFromCookieSource).not.toHaveBeenCalled();
    expect(verificationServiceMocks.startDiditVerificationFlow).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(null);

    const response = await POST(
      buildRequest({
        Origin: "http://localhost:3000"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login");
    expect(verificationServiceMocks.startDiditVerificationFlow).not.toHaveBeenCalled();
  });

  it("redirects a same-origin verified user to the Didit hosted session", async () => {
    const response = await POST(
      buildRequest({
        Origin: "http://localhost:3000"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://verify.didit.me/session/didit_session_1"
    );
    expect(verificationServiceMocks.startDiditVerificationFlow).toHaveBeenCalledWith("user_1");
  });
});
