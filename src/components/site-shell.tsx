import Link from "next/link";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth";
import { hasVerifiedEmail, isAdmin } from "@/lib/permissions";

export async function SiteShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const navGroups = [
    {
      label: "Browse",
      links: [
        { href: "/", label: "Home" },
        { href: "/listings", label: "Listings" },
        { href: "/listings/auctions", label: "Live auctions" },
        { href: "/listings/fixed-price", label: "Fixed price" }
      ]
    },
    {
      label: "Account",
      links: user
        ? [
            { href: "/account", label: "Dashboard" },
            { href: "/account/bids", label: "My bids" },
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
          ]
    },
    ...(user && isAdmin(user)
      ? [
          {
            label: "Admin",
            links: [
              { href: "/admin", label: "Dashboard" },
              { href: "/admin/listings", label: "Listings" },
              { href: "/admin/orders", label: "Orders" },
              { href: "/admin/pickup-events", label: "Pickup events" }
            ]
          }
        ]
      : [])
  ] as const;

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Layu Group LLC Auction
            </p>
            <h1 className="text-2xl font-semibold">Single-seller auction scaffold</h1>
            <p className="max-w-2xl text-sm text-zinc-600">
              App Router, TypeScript, Tailwind, Prisma, PostgreSQL, and Vitest are wired up.
              Product workflows are still intentionally stubbed.
            </p>
            {user ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                <span>Signed in as {user.email}</span>
                <form action="/api/auth/logout" method="post">
                  <button className="font-medium text-emerald-700 hover:text-emerald-800" type="submit">
                    Log out
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <nav className="grid gap-4 sm:grid-cols-3">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {group.label}
                </p>
                <ul className="space-y-1 text-sm">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link className="text-zinc-700 hover:text-emerald-700" href={link.href}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
