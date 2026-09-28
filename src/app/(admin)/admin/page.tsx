import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { crossListingRemovalFilter } from "@/lib/cross-listing/service";

const tools = [
  { href: "/admin/cross-listing", title: "List elsewhere", copy: "Prepare batches for other marketplaces, promote auctions on Facebook, and track posted items and removal tasks." },
  { href: "/admin/connections", title: "Accounts & connections", copy: "Set up Google and Facebook sign-in and connect your selling channels one at a time." },
  { href: "/admin/inventory", title: "Inventory & item returns", copy: "Find stock, record adjustments, assign units to listings, and track acquisition and selling costs." },
  { href: "/admin/inventory/purchase-orders", title: "Receive a purchase order", copy: "Upload a CSV, review the quantities and costs, then receive the order into stock." },
  { href: "/admin/listings", title: "Listings", copy: "Manage auction and fixed-price items. Use the description assistant in the listing editor to prepare a draft." },
  { href: "/admin/settings/verification", title: "Deposit tiers & buyer protection", copy: "Edit both deposit amounts, set the no-deposit auction limit, and choose buyer verification requirements." },
  { href: "/admin/orders", title: "Orders & fulfillment", copy: "Follow purchases from payment through pickup or shipping." },
  { href: "/admin/bidders", title: "Buyer accounts", copy: "Review buyer activity, record flags, and block accounts when needed." }
];

export default async function AdminDashboardPage() {
  const admin = await requireAdminUser();
  const removals = await prisma.crossListing.count({ where: { ...crossListingRemovalFilter(), sellerUserId: admin.id } });
  return <div className="space-y-8">
    <PageHeader eyebrow="Admin" title="Market dashboard" description={<p>Manage each item from arrival to sale.</p>} />
    {removals ? <p className="notice notice-warning"><strong>{removals} external offer{removals === 1 ? "" : "s"} or promotion{removals === 1 ? "" : "s"} need review</strong> after a sale, closing, or removal. <Link className="underline" href="/admin/cross-listing?attention=1">Review destinations</Link></p> : null}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => <Link key={tool.href} href={tool.href} className="surface-card block space-y-3 p-6 transition hover:border-amber-500">
        <h3 className="text-xl font-semibold text-zinc-950">{tool.title}</h3>
        <p className="text-sm text-zinc-600">{tool.copy}</p>
        <span className="text-sm font-semibold text-amber-700">Open →</span>
      </Link>)}
    </div>
  </div>;
}
