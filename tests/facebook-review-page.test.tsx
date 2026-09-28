import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { socialAccount: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: () => ({ app: { url: "https://market.example" } }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));

import FacebookReviewPage, { metadata } from "../src/app/(auth)/auth/facebook-review/page";
import { SocialSignIn } from "../src/components/auth/social-sign-in";

describe("Facebook review page and public visibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const [key, value] of Object.entries({ GOOGLE_LOGIN_ENABLED: "true", GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", FACEBOOK_LOGIN_ENABLED: "false", FACEBOOK_LOGIN_REVIEW_ENABLED: "true", FACEBOOK_CLIENT_ID: "facebook-id", FACEBOOK_CLIENT_SECRET: "facebook-secret", FACEBOOK_GRAPH_API_VERSION: "v26.0" })) vi.stubEnv(key, value);
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());
  const page = (params: Record<string, string> = {}) => FacebookReviewPage({ searchParams: Promise.resolve(params) });

  it.each(["false", "TRUE", ""])("keeps review unavailable without explicit enablement (%s)", async value => {
    vi.stubEnv("FACEBOOK_LOGIN_REVIEW_ENABLED", value);
    await expect(page()).rejects.toThrow("not-found");
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });
  it("removes the review page after public activation", async () => {
    vi.stubEnv("FACEBOOK_LOGIN_ENABLED", "true");
    await expect(page()).rejects.toThrow("not-found");
  });
  it("keeps Facebook out of normal sign-in and registration while preserving Google", () => {
    for (const intent of ["signin", "register"] as const) {
      const html = renderToStaticMarkup(<SocialSignIn intent={intent} />);
      expect(html).toContain("/api/auth/social/google/start");
      expect(html).not.toContain("/api/auth/social/facebook/start");
      expect(html).not.toContain("facebook-secret");
    }
  });
  it("renders the same Facebook OAuth endpoint for reviewers without exposing credentials", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('aria-label="Sign in with Facebook"');
    expect(html).toContain("/api/auth/social/facebook/start");
    expect(html).toContain("/auth/login?next=%2Fauth%2Ffacebook-review");
    expect(html).not.toContain("facebook-secret");
    expect(html).not.toContain("facebook-id");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
  it("requires terms acceptance for review registration", async () => {
    const html = renderToStaticMarkup(await page({ mode: "register" }));
    expect(html).toContain('name="intent" value="register"');
    expect(html).toMatch(/<input[^>]*required[^>]*name="termsAccepted"/);
    expect(html).toContain("Confirm your email with Layu");
  });
  it("requires the existing account to be verified before offering a link", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", emailVerifiedAtUtc: null });
    let html = renderToStaticMarkup(await page());
    expect(html).toContain("Confirm your email");
    expect(html).not.toContain('value="link"');
    mocks.getCurrentUser.mockResolvedValue({ id: "user", emailVerifiedAtUtc: new Date() });
    html = renderToStaticMarkup(await page());
    expect(html).toContain('name="intent" value="link"');
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { userId: "user", provider: "facebook" }, select: { id: true } });
  });
  it("shows a connection only after checking the account, not from a status query", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", emailVerifiedAtUtc: new Date() });
    expect(renderToStaticMarkup(await page({ status: "connected" }))).not.toContain("Facebook is connected to this account.");
    mocks.findFirst.mockResolvedValue({ id: "connection" });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Facebook is connected to this account.");
    expect(html).toContain("/api/auth/logout");
    expect(html).not.toContain('value="link"');
  });
});
