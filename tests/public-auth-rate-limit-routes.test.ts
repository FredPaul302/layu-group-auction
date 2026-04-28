import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  consumeEmailVerificationToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  createSignedSessionCookie: vi.fn(),
  getCurrentUserFromCookieSource: vi.fn(),
  getExpiredSessionCookie: vi.fn(),
  getSafeNextPath: vi.fn((nextPath: string, fallback: string) => nextPath || fallback),
  getSessionSnapshotFromRequestCookies: vi.fn(),
  isValidEmail: vi.fn((email: string) => email.includes("@")),
  isValidPassword: vi.fn((password: string) => password.length >= 8),
  issueEmailVerification: vi.fn(),
  issuePasswordReset: vi.fn(),
  refreshSignedSessionCookieFromSnapshot: vi.fn(),
  registerUser: vi.fn()
}));

const appEnvMocks = vi.hoisted(() => {
  class MockAppEnvError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AppEnvError";
    }
  }

  return {
    AppEnvError: MockAppEnvError,
    getAppEnv: vi.fn(() => ({
      app: {
        url: "http://localhost:3000"
      },
      runtime: {
        isProduction: false
      }
    }))
  };
});

const personaMocks = vi.hoisted(() => ({
  processPersonaWebhookPayload: vi.fn(),
  verifyPersonaWebhookSignature: vi.fn()
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/lib/verification/service", () => personaMocks);

import { POST as forgotPasswordPost } from "../src/app/api/auth/forgot-password/route.js";
import { POST as loginPost } from "../src/app/api/auth/login/route.js";
import { POST as registerPost } from "../src/app/api/auth/register/route.js";
import { POST as resetPasswordPost } from "../src/app/api/auth/reset-password/route.js";
import {
  GET as verifyEmailGet,
  POST as verifyEmailPost
} from "../src/app/api/auth/verify-email/route.js";
import { POST as personaWebhookPost } from "../src/app/api/persona/webhook/route.js";
import { publicAuthRateLimitRules } from "../src/app/api/_utils/public-auth-rate-limit.js";
import { resetRateLimitStoreForTests } from "../src/lib/rate-limit/index.js";

const forwardedHeaders = {
  "x-forwarded-for": "203.0.113.10"
};

function formRequest(url: string, formData: FormData, headers?: HeadersInit) {
  return new NextRequest(url, {
    body: formData,
    headers: {
      ...forwardedHeaders,
      ...headers
    },
    method: "POST"
  });
}

function loginForm(email = "buyer@example.com") {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", "password123");

  return formData;
}

function forgotPasswordForm(email = "buyer@example.com") {
  const formData = new FormData();
  formData.set("email", email);

  return formData;
}

function registerForm(email = "buyer@example.com") {
  const formData = new FormData();
  formData.set("displayName", "Buyer");
  formData.set("email", email);
  formData.set("password", "password123");
  formData.set("confirmPassword", "password123");
  formData.set("termsAccepted", "yes");

  return formData;
}

function resetPasswordForm(token = "reset-token") {
  const formData = new FormData();
  formData.set("token", token);
  formData.set("password", "new-password");
  formData.set("confirmPassword", "new-password");

  return formData;
}

describe("public auth endpoint rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
    authMocks.authenticateUser.mockResolvedValue(null);
    authMocks.consumeEmailVerificationToken.mockResolvedValue({
      status: "invalid"
    });
    authMocks.consumePasswordResetToken.mockResolvedValue({
      status: "invalid"
    });
    authMocks.createSignedSessionCookie.mockResolvedValue({
      cookieName: "layu_session",
      cookieOptions: {
        path: "/"
      },
      cookieValue: "signed-session"
    });
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      email: "buyer@example.com",
      emailVerifiedAtUtc: null,
      id: "user_1"
    });
    authMocks.getExpiredSessionCookie.mockReturnValue({
      cookieName: "layu_session",
      cookieOptions: {
        path: "/"
      },
      cookieValue: ""
    });
    personaMocks.processPersonaWebhookPayload.mockResolvedValue({
      status: "processed"
    });
    authMocks.registerUser.mockResolvedValue({
      email: "buyer@example.com",
      id: "user_1",
      role: "bidder"
    });
    personaMocks.verifyPersonaWebhookSignature.mockReturnValue(true);
  });

  it("blocks login before authenticateUser after the email limit is exceeded", async () => {
    for (let attempt = 0; attempt < publicAuthRateLimitRules.loginEmail.limit; attempt += 1) {
      await loginPost(
        formRequest("http://localhost/api/auth/login", loginForm("buyer@example.com"))
      );
    }

    authMocks.authenticateUser.mockClear();

    const response = await loginPost(
      formRequest("http://localhost/api/auth/login", loginForm("buyer@example.com"))
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=too_many_attempts"
    );
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(authMocks.authenticateUser).not.toHaveBeenCalled();
  });

  it("allows a normal login attempt to keep the existing invalid-credentials redirect", async () => {
    const response = await loginPost(
      formRequest("http://localhost/api/auth/login", loginForm("buyer@example.com"))
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=invalid_credentials"
    );
    expect(authMocks.authenticateUser).toHaveBeenCalledWith(
      "buyer@example.com",
      "password123"
    );
  });

  it("blocks forgot-password before sending reset email", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.forgotPasswordEmail.limit;
      attempt += 1
    ) {
      await forgotPasswordPost(
        formRequest(
          "http://localhost/api/auth/forgot-password",
          forgotPasswordForm("buyer@example.com")
        )
      );
    }

    authMocks.issuePasswordReset.mockClear();

    const response = await forgotPasswordPost(
      formRequest(
        "http://localhost/api/auth/forgot-password",
        forgotPasswordForm("buyer@example.com")
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/forgot-password?error=too_many_attempts"
    );
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(authMocks.issuePasswordReset).not.toHaveBeenCalled();
  });

  it("blocks register before creating an account or sending verification email", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.registerEmail.limit;
      attempt += 1
    ) {
      await registerPost(
        formRequest("http://localhost/api/auth/register", registerForm("buyer@example.com"))
      );
    }

    authMocks.registerUser.mockClear();
    authMocks.issueEmailVerification.mockClear();

    const response = await registerPost(
      formRequest("http://localhost/api/auth/register", registerForm("buyer@example.com"))
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/register?error=too_many_attempts"
    );
    expect(authMocks.registerUser).not.toHaveBeenCalled();
    expect(authMocks.issueEmailVerification).not.toHaveBeenCalled();
  });

  it("blocks reset-password before consuming the token", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.resetPasswordToken.limit;
      attempt += 1
    ) {
      await resetPasswordPost(
        formRequest(
          "http://localhost/api/auth/reset-password",
          resetPasswordForm("reset-token")
        )
      );
    }

    authMocks.consumePasswordResetToken.mockClear();

    const response = await resetPasswordPost(
      formRequest(
        "http://localhost/api/auth/reset-password",
        resetPasswordForm("reset-token")
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/reset-password?token=reset-token&error=too_many_attempts"
    );
    expect(authMocks.consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("blocks verify-email token consumption before consuming the token", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.verifyEmailToken.limit;
      attempt += 1
    ) {
      await verifyEmailGet(
        new NextRequest("http://localhost/api/auth/verify-email?token=email-token", {
          headers: forwardedHeaders
        })
      );
    }

    authMocks.consumeEmailVerificationToken.mockClear();

    const response = await verifyEmailGet(
      new NextRequest("http://localhost/api/auth/verify-email?token=email-token", {
        headers: forwardedHeaders
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/verify-email?status=too_many_attempts"
    );
    expect(authMocks.consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it("blocks verify-email resend before sending email", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.verifyEmailResendUser.limit;
      attempt += 1
    ) {
      await verifyEmailPost(
        formRequest(
          "http://localhost/api/auth/verify-email",
          new FormData(),
          {
            Origin: "http://localhost:3000"
          }
        )
      );
    }

    authMocks.issueEmailVerification.mockClear();

    const response = await verifyEmailPost(
      formRequest(
        "http://localhost/api/auth/verify-email",
        new FormData(),
        {
          Origin: "http://localhost:3000"
        }
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/verify-email?status=too_many_attempts"
    );
    expect(authMocks.issueEmailVerification).not.toHaveBeenCalled();
  });

  it("returns 429 for over-limit Persona webhooks without processing the payload", async () => {
    for (
      let attempt = 0;
      attempt < publicAuthRateLimitRules.personaWebhookIp.limit;
      attempt += 1
    ) {
      await personaWebhookPost(
        new NextRequest("http://localhost/api/persona/webhook", {
          body: JSON.stringify({ data: { attributes: { name: "test" } } }),
          headers: forwardedHeaders,
          method: "POST"
        })
      );
    }

    personaMocks.processPersonaWebhookPayload.mockClear();
    personaMocks.verifyPersonaWebhookSignature.mockClear();

    const response = await personaWebhookPost(
      new NextRequest("http://localhost/api/persona/webhook", {
        body: JSON.stringify({ data: { attributes: { name: "test" } } }),
        headers: forwardedHeaders,
        method: "POST"
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      status: "too_many_attempts"
    });
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(personaMocks.verifyPersonaWebhookSignature).not.toHaveBeenCalled();
    expect(personaMocks.processPersonaWebhookPayload).not.toHaveBeenCalled();
  });

  it("keeps Persona signature verification intact for under-limit webhooks", async () => {
    personaMocks.verifyPersonaWebhookSignature.mockReturnValue(false);

    const response = await personaWebhookPost(
      new NextRequest("http://localhost/api/persona/webhook", {
        body: JSON.stringify({ data: { attributes: { name: "test" } } }),
        headers: forwardedHeaders,
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "invalid_signature"
    });
    expect(personaMocks.verifyPersonaWebhookSignature).toHaveBeenCalled();
    expect(personaMocks.processPersonaWebhookPayload).not.toHaveBeenCalled();
  });
});
