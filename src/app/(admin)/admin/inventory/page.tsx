import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";
import { formatMoney } from "@/lib/catalog";
import { getAllocationReturn, getInventorySummary } from "@/lib/inventory/rules";
import { listInventory } from "@/lib/inventory/service";

import { InventoryFeedback, type InventorySearchParams, queryValue } from "./inventory-feedback";

export default async function AdminInventoryPage({
  searchParams
}: { searchParams?: Promise<InventorySearchParams> }) {
  const admin = await requireAdminUser();
  const params = await (searchParams ?? Promise.resolve({} as InventorySearchParams));
  const search = queryValue(params.q).trim().slice(0, 200);
  const items = await listInventory(admin.id, search || undefined);
  const rows = items.map((item) => ({ item, summary: getInventorySummary(item) }));
  const totals = rows.reduce((total, { item, summary }) => ({
    available: total.available + summary.available,
    onHand: total.onHand + summary.onHand,
    stockCostCents: total.stockCostCents + summary.stockCostCents,
    contributionCents: total.contributionCents + item.allocations.reduce((sum, allocation) => sum + (getAllocationReturn(allocation).contributionCents ?? 0), 0)
  }), { available: 0, onHand: 0, stockCostCents: 0, contributionCents: 0 });

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        actions={<>
          <a className="button-secondary px-4 py-2 text-sm font-medium" href={`/api/admin/inventory/export${search ? `?q=${encodeURIComponent(search)}` : ""}`}>Export CSV</a>
          <Link className="button-primary px-4 py-2 text-sm font-medium" href="/admin/inventory/purchase-orders">Purchase orders / add stock</Link>
        </>}
        description={<p>Track what you own, what is set aside for listings, and the return on each paid sale. Open an item to adjust stock or connect an auction or fixed-price listing.</p>}
        eyebrow="Admin · Market operations"
        meta={<>
          <div className="metric-card"><span className="meta-label">Available units</span><span className="meta-value tabular-data">{totals.available}</span></div>
          <div className="metric-card"><span className="meta-label">Units on hand</span><span className="meta-value tabular-data">{totals.onHand}</span></div>
          <div className="metric-card"><span className="meta-label">Stock cost</span><span className="meta-value tabular-data">{formatMoney(totals.stockCostCents)}</span></div>
          <div className="metric-card"><span className="meta-label">Paid sales contribution*</span><span className="meta-value tabular-data">{formatMoney(totals.contributionCents)}</span></div>
        </>}
        title="Inventory"
      />

      <InventoryFeedback params={params} />

      <p className="text-sm text-zinc-600">{search ? "Totals reflect the matching inventory below. " : ""}*Contribution uses recorded item and selling costs before overhead. Selling costs start at $0; enter payment fees, shipping, packaging, and other costs to complete the estimate.</p>

      <form className="surface-card flex flex-wrap items-end gap-3 p-5" method="get">
        <label className="min-w-48 flex-1 space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Find inventory</span>
          <input className="w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={search} maxLength={200} name="q" placeholder="SKU, item name, or location" type="search" />
        </label>
        <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">Search</button>
        {search ? <Link className="button-ghost px-3 py-2 text-sm" href="/admin/inventory">Clear</Link> : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState action={<Link className="button-primary px-4 py-2 text-sm" href="/admin/inventory/purchase-orders">Add stock from a purchase order</Link>} description={search ? "Try another SKU, title, or storage location." : "Upload a purchase order CSV, review it, and receive the order to create your first inventory items."} title={search ? "No matching inventory" : "Start with the stock you own"} />
      ) : (
        <section aria-label="Inventory items" className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-5"><h3 className="text-lg font-semibold text-zinc-950">{rows.length} inventory items</h3><p className="text-sm text-zinc-600">Open an item for costs, listings, and history.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-4" scope="col">Item / SKU</th><th className="p-4" scope="col">Location</th><th className="p-4 text-right" scope="col">On hand</th><th className="p-4 text-right" scope="col">Available</th><th className="p-4 text-right" scope="col">Assigned listings</th><th className="p-4 text-right" scope="col">Paid sales</th><th className="p-4 text-right" scope="col">Unit cost</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map(({ item, summary }) => (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className="p-4"><Link className="font-semibold text-emerald-800 underline-offset-4 hover:underline" href={`/admin/inventory/${item.id}`}>{item.title}</Link><p className="mt-1 text-xs text-zinc-500">{item.sku}</p></td>
                    <td className="p-4 text-zinc-600">{item.location ?? "—"}</td>
                    <td className="p-4 text-right tabular-nums">{summary.onHand}</td><td className="p-4 text-right font-semibold tabular-nums">{summary.available}</td><td className="p-4 text-right tabular-nums">{summary.allocated}</td><td className="p-4 text-right tabular-nums">{summary.sold}</td><td className="p-4 text-right tabular-nums">{formatMoney(item.unitCostCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
        <p>Each linked listing sets aside one unit. Available stock excludes those allocations; stock on hand falls when linked orders are fulfilled. CSV exports are for records and future integrations. They do not synchronize with Shopify or another selling channel.</p>
      </div>
    </div>
  );
}
