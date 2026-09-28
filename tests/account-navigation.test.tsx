import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  getUserVerificationOverview: vi.fn(),
  pathname: "/",
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); })
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireAuthenticatedUser: mocks.requireAuthenticatedUser
}));
vi.mock("@/lib/verification/service", () => ({
  getUserVerificationOverview: mocks.getUserVerificationOverview
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  redirect: mocks.redirect
}));

import { SiteShell } from "../src/components/site-shell.js";
import AccountDashboardPage from "../src/app/(account)/account/page.js";

describe("Account navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
  });

  it.each(["/", "/listings", "/admin/listings/bulk"])(
    "takes an admin back to their dashboard from %s",
    async (pathname) => {
      mocks.pathname = pathname;
      mocks.getCurrentUser.mockResolvedValue({ id: "admin_1", role: "admin", email: "admin@example.test" });
      const html = renderToStaticMarkup(await SiteShell({ children: <p>Page content</p> }));
      const accountLink = html.match(/<a\b[^>]*>Account<\/a>/u)?.[0];

      expect(accountLink).toContain('href="/admin"');
      expect(accountLink?.includes('aria-current="page"')).toBe(pathname.startsWith("/admin"));
    }
  );

  it.each([
    { name: "buyer", user: { id: "buyer_1", role: "bidder", email: "buyer@example.test" } },
    { name: "signed-out visitor", user: null }
  ])("keeps the normal Account destination for a $name", async ({ user }) => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const html = renderToStaticMarkup(await SiteShell({ children: null }));
    expect(html.match(/<a\b[^>]*>Account<\/a>/u)?.[0]).toContain('href="/account"');
  });

  it("redirects an admin visiting /account before loading buyer verification data", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue({ id: "admin_1", role: "admin" });

    await expect(AccountDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(mocks.getUserVerificationOverview).not.toHaveBeenCalled();
  });

  it("continues to render the buyer account dashboard", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue({
      id: "buyer_1", role: "bidder", email: "buyer@example.test", emailVerifiedAtUtc: null
    });
    mocks.getUserVerificationOverview.mockResolvedValue({
      policy: { verificationLevel: 3, emailOnlyLimitCents: 10000 },
      derivedEligibility: { isVerificationEligible: false, maxBidTier: "tier_0" }
    });

    const html = renderToStaticMarkup(await AccountDashboardPage());
    expect(html).toContain("Account dashboard");
    expect(mocks.getUserVerificationOverview).toHaveBeenCalledWith("buyer_1");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires sign-in before choosing a dashboard", async () => {
    mocks.requireAuthenticatedUser.mockRejectedValue(new Error("NEXT_REDIRECT:/auth/login"));

    await expect(AccountDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
    expect(mocks.getUserVerificationOverview).not.toHaveBeenCalled();
  });
});
