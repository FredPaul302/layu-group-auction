import type { ReactNode } from "react";

import { NavChipLink } from "@/components/ui/nav-chip-link";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();

  return (
    <div className="page-stack">
      <section className="workspace-banner motion-section motion-delay-1 space-y-4 py-3">
        <div className="space-y-2">
          <p className="eyebrow">Account workspace</p>
          <h2 className="text-2xl font-semibold text-zinc-950">Your auction activity</h2>
          <p className="max-w-3xl text-sm text-zinc-600">
            Signed in as {user.email}. Verification, bids, orders, offers, and fulfillment stay in
            this area with the existing permission checks intact.
          </p>
        </div>

        <nav className="nav-links">
          <NavChipLink className="text-sm" href="/account">
            Dashboard
          </NavChipLink>
          <NavChipLink className="text-sm" href="/account/verification">
            Verification
          </NavChipLink>
          <NavChipLink className="text-sm" href="/account/bids">
            My bids
          </NavChipLink>
          <NavChipLink className="text-sm" href="/account/purchases">
            Orders
          </NavChipLink>
          <NavChipLink className="text-sm" href="/account/offers">
            Offers
          </NavChipLink>
        </nav>
      </section>

      {children}
    </div>
  );
}
