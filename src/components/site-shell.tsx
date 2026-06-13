import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { NavChipLink } from "@/components/ui/nav-chip-link";
import { RouteScrollReset } from "@/components/ui/route-scroll-reset";
import { getCurrentUser } from "@/lib/auth";

export async function SiteShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const primaryLinks = [
    { href: "/", label: "Home" },
    { href: "/listings", label: "Listings" },
    { href: "/account", label: "Account" }
  ] as const;

  return (
    <div className="app-shell">
      <RouteScrollReset />
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
              <div className="site-nav__links">
                {primaryLinks.map((link) => (
                  <NavChipLink key={link.href} className="text-sm" href={link.href}>
                    {link.label}
                  </NavChipLink>
                ))}
              </div>
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
            <Link className="text-emerald-700 hover:text-emerald-800" href="/terms">
              Terms
            </Link>
            <Link className="text-emerald-700 hover:text-emerald-800" href="/privacy">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
