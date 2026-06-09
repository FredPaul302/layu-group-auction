import type { ReactNode } from "react";

import { NavChipLink } from "@/components/ui/nav-chip-link";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminUser();

  return (
    <div className="page-stack">
      <section className="workspace-banner motion-section motion-delay-1 space-y-4 py-3">
        <div className="space-y-2">
          <p className="eyebrow">Admin operations</p>
          <h2 className="text-2xl font-semibold text-zinc-950">Review queues and control surfaces</h2>
          <p className="max-w-3xl text-sm text-zinc-600">
            Listings, payments, verification, offers, bidder flags, and fulfillment stay under
            explicit admin control.
          </p>
        </div>

        <nav className="nav-links">
          <NavChipLink className="text-sm" href="/admin">
            Dashboard
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/listings">
            Listings
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/listings/bulk">
            Bulk listings
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/categories">
            Categories
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/pickup-events">
            Pickup events
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/orders">
            Orders
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/payments">
            Payments
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/deposits">
            Deposits
          </NavChipLink>
          <NavChipLink className="text-sm" href="/admin/bidders">
            Bidders
          </NavChipLink>
        </nav>
      </section>

      {children}
    </div>
  );
}
