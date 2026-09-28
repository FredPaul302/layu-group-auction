import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn(), createSignedSessionCookie: vi.fn(), issueEmailVerification: vi.fn(),
  getSocialProviderConfig: vi.fn(), consumeSocialAttempt: vi.fn(), createSocialAttempt: vi.fn(), resolveSocialIdentity: vi.fn(),
  disconnectSocialAccount: vi.fn(),
  buildSocialAuthorizationUrl: vi.fn(), exchangeSocialCode: vi.fn(), consumeRateLimits: vi.fn()
}));
vi.mock("@/lib/auth", () => mocks);
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: () => ({ app: { url: "https://market.example" } }) }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimits: mocks.consumeRateLimits, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth/social-config", () => ({ getSocialProviderConfig: mocks.getSocialProviderConfig, isSocialProvider: (value: string) => value === "google" || value === "facebook" }));
vi.mock("@/lib/auth/social-service", () => mocks);
vi.mock("@/lib/auth/social-provider", () => {
  class SocialAuthError extends Error { constructor(public readonly code: string) { super(code); } }
  return { SocialAuthError, buildSocialAuthorizationUrl: mocks.buildSocialAuthorizationUrl, exchangeSocialCode: mocks.exchangeSocialCode };
});

import { disconnectSocialLogin, finishSocialLogin, startSocialLogin } from "../src/lib/auth/social-routes";
import { SocialAuthError } from "../src/lib/auth/social-provider";

const user = { id: "user", email: "person@example.com", emailVerifiedAtUtc: new Date() };
const attempt = { intent: "signin", userId: null, termsVersion: null, nextPath: "/account", nonce: "nonce", codeVerifier: "verifier" };

describe("social OAuth routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSocialProviderConfig.mockReturnValue({ provider: "google" });
    mocks.consumeRateLimits.mockResolvedValue(null);
    mocks.buildSocialAuthorizationUrl.mockReturnValue(new URL("https://accounts.google.com/oauth?state=opaque"));
    mocks.createSocialAttempt.mockResolvedValue({ state: "state", browserToken: "browser-token", codeVerifier: "verifier", nonce: "nonce", expiresAtUtc: new Date(Date.now() + 600_000) });
    mocks.consumeSocialAttempt.mockResolvedValue(attempt);
    mocks.exchangeSocialCode.mockResolvedValue({ provider: "google", providerAccountId: "sub" });
    mocks.resolveSocialIdentity.mockResolvedValue({ user, created: false });
    mocks.createSignedSessionCookie.mockResolvedValue({ cookieName: "layu_session", cookieValue: "signed-session", cookieOptions: { httpOnly: true, path: "/" } });
  });
  function start(origin = "https://market.example", intent = "signin") {
    const data = new FormData(); data.set("intent", intent); data.set("termsAccepted", "yes");
    return new NextRequest("https://market.example/api/auth/social/google/start", { method: "POST", headers: { origin }, body: data });
  }
  function callback(suffix = "state=opaque&code=authorization-code") {
    return new NextRequest(`https://market.example/api/auth/social/google/callback?${suffix}`, { headers: { cookie: "layu_oauth_google=browser-token" } });
  }
  it("rejects cross-site initiation before creating state", async () => {
    expect((await startSocialLogin(start("https://evil.example"), "google")).status).toBe(403);
    expect(mocks.createSocialAttempt).not.toHaveBeenCalled();
  });
  it("does not start an unconfigured provider", async () => {
    mocks.getSocialProviderConfig.mockReturnValue(null);
    const response = await startSocialLogin(start(), "google");
    expect(response.headers.get("location")).toContain("error=social_disabled");
    expect(mocks.createSocialAttempt).not.toHaveBeenCalled();
  });
  it("sets a private short-lived browser-binding cookie and redirects to the provider", async () => {
    const response = await startSocialLogin(start(), "google");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("https://accounts.google.com/");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rate limits provider initiation", async () => {
    mocks.consumeRateLimits.mockResolvedValue({ retryAfterSeconds: 60 });
    expect((await startSocialLogin(start(), "google")).headers.get("location")).toContain("too_many_attempts");
    expect(mocks.createSocialAttempt).not.toHaveBeenCalled();
  });
  it("consumes the bound attempt before exchanging a code and creates a session", async () => {
    const response = await finishSocialLogin(callback(), "google");
    expect(mocks.consumeSocialAttempt).toHaveBeenCalledWith("google", "opaque", "browser-token");
    expect(mocks.consumeSocialAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.exchangeSocialCode.mock.invocationCallOrder[0]);
    expect(response.headers.get("location")).toBe("https://market.example/account");
    expect(response.headers.get("set-cookie")).toContain("layu_session=signed-session");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("does not exchange a code if state validation fails", async () => {
    mocks.consumeSocialAttempt.mockRejectedValue(new SocialAuthError("social_expired"));
    expect((await finishSocialLogin(callback(), "google")).headers.get("location")).toContain("social_expired");
    expect(mocks.exchangeSocialCode).not.toHaveBeenCalled();
    expect(mocks.createSignedSessionCookie).not.toHaveBeenCalled();
  });
  it("handles cancellation without token exchange", async () => {
    expect((await finishSocialLogin(callback("state=opaque&error=access_denied"), "google")).headers.get("location")).toContain("social_cancelled");
    expect(mocks.exchangeSocialCode).not.toHaveBeenCalled();
  });
  it("routes new unverified accounts to email confirmation", async () => {
    mocks.resolveSocialIdentity.mockResolvedValue({ user: { ...user, emailVerifiedAtUtc: null }, created: true });
    expect((await finishSocialLogin(callback(), "google")).headers.get("location")).toBe("https://market.example/auth/verify-email");
    expect(mocks.issueEmailVerification).toHaveBeenCalled();
  });
  it("rechecks current authentication on linking and does not replace the current session", async () => {
    mocks.consumeSocialAttempt.mockResolvedValue({ ...attempt, intent: "link", userId: "user", nextPath: "/account/connections" });
    mocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    const response = await finishSocialLogin(callback(), "google");
    expect(mocks.resolveSocialIdentity.mock.calls[0][0]).toMatchObject({ intent: "link", linkedUserId: "user", currentUser: user });
    expect(response.headers.get("location")).toBe("https://market.example/account/connections?status=connected");
    expect(mocks.createSignedSessionCookie).not.toHaveBeenCalled();
  });
  it("never sends provider secrets or errors to the browser", async () => {
    mocks.exchangeSocialCode.mockRejectedValue(new Error("secret-provider-token"));
    const response = await finishSocialLogin(callback(), "google");
    expect(response.headers.get("location")).toContain("social_failed");
    expect(response.headers.get("location")).not.toContain("secret-provider-token");
  });
  it("keeps Facebook review requests subject to origin checks, rate limits and bound state", async () => {
    mocks.getSocialProviderConfig.mockReturnValue({ provider: "facebook", reviewOnly: true });
    expect((await startSocialLogin(start("https://evil.example"), "facebook")).status).toBe(403);
    expect(mocks.createSocialAttempt).not.toHaveBeenCalled();
    mocks.consumeRateLimits.mockResolvedValue({ retryAfterSeconds: 60 });
    expect((await startSocialLogin(start(), "facebook")).headers.get("location")).toBe("https://market.example/auth/facebook-review?error=too_many_attempts");
    mocks.consumeSocialAttempt.mockRejectedValue(new SocialAuthError("social_expired"));
    expect((await finishSocialLogin(callback(), "facebook")).headers.get("location")).toBe("https://market.example/auth/facebook-review?error=social_expired");
    expect(mocks.exchangeSocialCode).not.toHaveBeenCalled();
  });
  it("preserves registration consent and returns review errors to the registration form", async () => {
    mocks.getSocialProviderConfig.mockReturnValue({ provider: "facebook", reviewOnly: true });
    mocks.createSocialAttempt.mockRejectedValue(new SocialAuthError("terms_required"));
    const data = new FormData(); data.set("intent", "register");
    const request = new NextRequest("https://market.example/api/auth/social/facebook/start", { method: "POST", headers: { origin: "https://market.example" }, body: data });
    expect((await startSocialLogin(request, "facebook")).headers.get("location")).toBe("https://market.example/auth/facebook-review?mode=register&error=terms_required");
    expect(mocks.createSocialAttempt).toHaveBeenCalledWith(expect.objectContaining({ intent: "register", termsAccepted: false }));
    mocks.consumeSocialAttempt.mockResolvedValue({ ...attempt, intent: "register" });
    expect((await finishSocialLogin(callback("state=opaque&error=access_denied"), "facebook")).headers.get("location")).toBe("https://market.example/auth/facebook-review?mode=register&error=social_cancelled");
    expect(mocks.exchangeSocialCode).not.toHaveBeenCalled();
  });
  it("returns a successful Facebook review link to the review page without replacing the session", async () => {
    mocks.getSocialProviderConfig.mockReturnValue({ provider: "facebook", reviewOnly: true });
    mocks.consumeSocialAttempt.mockResolvedValue({ ...attempt, intent: "link", userId: "user" });
    mocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    expect((await finishSocialLogin(callback(), "facebook")).headers.get("location")).toBe("https://market.example/auth/facebook-review?status=connected");
    expect(mocks.resolveSocialIdentity).toHaveBeenCalledWith(expect.objectContaining({ currentUser: user, linkedUserId: "user", intent: "link" }));
    expect(mocks.createSignedSessionCookie).not.toHaveBeenCalled();
  });
  it("does not skip Layu email verification during Facebook review registration", async () => {
    mocks.getSocialProviderConfig.mockReturnValue({ provider: "facebook", reviewOnly: true });
    mocks.resolveSocialIdentity.mockResolvedValue({ user: { ...user, emailVerifiedAtUtc: null }, created: true });
    expect((await finishSocialLogin(callback(), "facebook")).headers.get("location")).toBe("https://market.example/auth/verify-email");
    expect(mocks.issueEmailVerification).toHaveBeenCalled();
  });
  it("requires same-origin and a signed-in session to disconnect", async () => {
    expect((await disconnectSocialLogin(start("https://evil.example"), "google")).status).toBe(403);
    mocks.getCurrentUserFromCookieSource.mockResolvedValue(null);
    expect((await disconnectSocialLogin(start(), "google")).headers.get("location")).toContain("/auth/login");
    expect(mocks.disconnectSocialAccount).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before disconnecting", async () => {
    mocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    expect((await disconnectSocialLogin(start(), "google")).headers.get("location")).toContain("social_disconnect_confirm");
    expect(mocks.disconnectSocialAccount).not.toHaveBeenCalled();
  });
  it("disconnects only the authenticated user's selected provider", async () => {
    mocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    const data = new FormData(); data.set("confirmDisconnect", "yes"); data.set("userId", "victim");
    const request = new NextRequest("https://market.example/api/auth/social/google/disconnect", { method: "POST", headers: { origin: "https://market.example" }, body: data });
    expect((await disconnectSocialLogin(request, "google")).headers.get("location")).toContain("status=disconnected");
    expect(mocks.disconnectSocialAccount).toHaveBeenCalledWith("user", "google");
  });
});
