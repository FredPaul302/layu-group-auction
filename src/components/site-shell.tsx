import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { NavChipLink } from "@/components/ui/nav-chip-link";
import { getCurrentUser } from "@/lib/auth";
import { hasVerifiedEmail, isAdmin } from "@/lib/permissions";

export async function SiteShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const browseLinks = [
    { href: "/", label: "Home" },
    { href: "/listings", label: "Listings" },
    { href: "/listings/auctions", label: "Live auctions" },
    { href: "/listings/fixed-price", label: "Fixed price" }
  ] as const;
  const accountLinks = user
    ? [
        { href: "/account", label: "Dashboard" },
        { href: "/account/bids", label: "My bids" },
        { href: "/account/purchases", label: "Orders" },
        { href: "/account/offers", label: "Offers" },
        {
          href: "/auth/verify-email",
          label: hasVerifiedEmail(user) ? "Email verified" : "Verify email"
        },
        { href: "/account/verification", label: "Verification" }
      ]
    : [
        { href: "/auth/login", label: "Log in" },
        { href: "/auth/register", label: "Register" },
        { href: "/auth/forgot-password", label: "Forgot password" }
      ];
  const adminLinks =
    user && isAdmin(user)
      ? [
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/listings", label: "Listings" },
          { href: "/admin/orders", label: "Orders" },
          { href: "/admin/pickup-events", label: "Pickup events" }
        ]
      : null;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="app-container">
          <div className="site-header__inner">
            <div className="site-header__topbar">
              <div className="site-branding">
                <Link className="site-brand" href="/">
                  Layu Group LLC Auction
                </Link>
                <p className="site-tagline">
                  Single-seller auctions and fixed-price listings with manual review and clear
                  fulfillment steps.
                </p>
              </div>

              <div className="site-header__tools">
                <ThemeToggle />
                {user ? (
                  <>
                    <span className="site-userline">Signed in as {user.email}</span>
                    <form action="/api/auth/logout" method="post">
                      <button className="button-ghost text-sm font-medium" type="submit">
                        Log out
                      </button>
                    </form>
                  </>
                ) : (
                  <span className="site-userline">Guest browsing is read-only.</span>
                )}
              </div>
            </div>

            <nav aria-label="Primary site navigation" className="site-nav">
              <div className="site-nav__section">
                <span className="site-nav__label">Browse</span>
                <div className="site-nav__links">
                  {browseLinks.map((link) => (
                    <NavChipLink key={link.href} className="text-sm" href={link.href}>
                      {link.label}
                    </NavChipLink>
                  ))}
                </div>
              </div>

              <div className="site-nav__section site-nav__section-secondary">
                <span className="site-nav__label">{user ? "Account" : "Access"}</span>
                <div className="site-nav__links">
                  {accountLinks.map((link) => (
                    <NavChipLink key={link.href} className="text-sm" href={link.href}>
                      {link.label}
                    </NavChipLink>
                  ))}
                </div>
              </div>

              {adminLinks ? (
                <div className="site-nav__section site-nav__section-secondary">
                  <span className="site-nav__label">Admin</span>
                  <div className="site-nav__links">
                    {adminLinks.map((link) => (
                      <NavChipLink key={link.href} className="text-sm" href={link.href}>
                        {link.label}
                      </NavChipLink>
                    ))}
                  </div>
                </div>
              ) : null}
            </nav>
          </div>
        </div>
      </header>

      <main className="app-container py-8 md:py-10">
        <div className="page-stack">{children}</div>
      </main>

      <footer className="site-footer">
        <div className="app-container site-footer__inner">
          <p>Manual payments only. PayPal, Venmo, and Cash App stay outside the site.</p>
          <div className="site-footer__links">
            <Link className="text-emerald-700 hover:text-emerald-800" href="/help/payments">
              Payment help
            </Link>
            <Link
              className="text-emerald-700 hover:text-emerald-800"
              href="/help/pickup-shipping"
            >
              Pickup and shipping
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
