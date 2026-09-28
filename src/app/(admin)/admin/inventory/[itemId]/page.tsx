import Link from "next/link";
import { notFound } from "next/navigation";

import { InventorySubmitButton } from "@/components/admin/inventory-import";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth";
import { formatListingTypeLabel, formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import {
  adjustInventoryAction,
  allocateInventoryAction,
  releaseInventoryAllocationAction,
  updateAllocationSellingCostAction
} from "@/lib/inventory/actions";
import { getAllocationReturn, getInventorySummary } from "@/lib/inventory/rules";
import { getInventoryItem, listAvailableInventoryListings } from "@/lib/inventory/service";

import { InventoryFeedback, type InventorySearchParams } from "../inventory-feedback";

const inputClass = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2";
const movementLabels: Record<string, string> = {
  purchase_receipt: "Purchase received",
  receipt: "Purchase received",
  adjustment: "Stock adjustment",
  listing_assigned: "Listing assigned",
  listing_released: "Listing released",
  selling_cost_updated: "Selling costs updated"
};

export default async function AdminInventoryItemPage({
  params,
  searchParams
}: {
  params: Promise<{ itemId: string }>;
  searchParams?: Promise<InventorySearchParams>;
}) {
  const admin = await requireAdminUser();
  const { itemId } = await params;
  const query = await (searchParams ?? Promise.resolve({} as InventorySearchParams));
  const [item, listings] = await Promise.all([
    getInventoryItem(admin.id, itemId),
    listAvailableInventoryListings(admin.id)
  ]);
  if (!item) notFound();
  const summary = getInventorySummary(item);

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        actions={<Link className="button-secondary px-4 py-2 text-sm font-medium" href="/admin/inventory">All inventory</Link>}
        description={<p>SKU {item.sku} · {item.location ?? "No storage location recorded"}. Unit cost is {formatMoney(item.unitCostCents)} for available stock; each linked listing keeps the cost recorded when it was assigned.</p>}
        eyebrow="Admin · Inventory item"
        meta={<>
          <div className="metric-card"><span className="meta-label">Available to list</span><span className="meta-value tabular-data">{summary.available}</span></div>
          <div className="metric-card"><span className="meta-label">On hand</span><span className="meta-value tabular-data">{summary.onHand}</span></div>
          <div className="metric-card"><span className="meta-label">Paid / fulfilled units</span><span className="meta-value tabular-data">{summary.sold} / {summary.fulfilled}</span></div>
          <div className="metric-card"><span className="meta-label">Stock cost on hand</span><span className="meta-value tabular-data">{formatMoney(summary.stockCostCents)}</span></div>
        </>}
        title={item.title}
      />
      <InventoryFeedback params={query} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section aria-labelledby="adjust-inventory" className="surface-card min-w-0 space-y-4 p-5">
          <div className="space-y-1"><h3 className="text-xl font-semibold text-zinc-950" id="adjust-inventory">Inventory adjustment</h3><p className="text-sm text-zinc-600">Record a count correction, damage, loss, or found stock. Use purchase orders for new purchases.</p></div>
          <form action={adjustInventoryAction.bind(null, item.id)} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-zinc-700"><span className="font-medium text-zinc-900">Change in units</span><input className={inputClass} max={1_000_000} min={-1_000_000} name="quantityDelta" placeholder="-1 or 2" required step={1} type="number" /><span className="block text-xs text-zinc-500">A negative number removes available units.</span></label>
            <label className="space-y-2 text-sm text-zinc-700"><span className="font-medium text-zinc-900">Cost per added unit ($)</span><input className={inputClass} defaultValue={(item.unitCostCents / 100).toFixed(2)} min={0} name="unitCost" step="0.01" type="number" /><span className="block text-xs text-zinc-500">Required for additions; ignored for removals.</span></label>
            <label className="space-y-2 text-sm text-zinc-700 sm:col-span-2"><span className="font-medium text-zinc-900">Reason</span><input className={inputClass} maxLength={500} name="reason" placeholder="One unit damaged during inspection" required /></label>
            <div className="sm:col-span-2"><InventorySubmitButton className="button-secondary px-4 py-2 text-sm font-medium" pendingLabel="Recording adjustment…">Record adjustment</InventorySubmitButton></div>
          </form>
        </section>

        <section aria-labelledby="allocate-stock" className="surface-card min-w-0 space-y-4 p-5">
          <div className="space-y-1"><h3 className="text-xl font-semibold text-zinc-950" id="allocate-stock">Connect a listing</h3><p className="text-sm text-zinc-600">Set aside one unit for an existing auction or fixed-price listing. Each listing can use one inventory unit.</p></div>
          {summary.available > 0 && listings.length > 0 ? (
            <form action={allocateInventoryAction.bind(null, item.id)} className="space-y-4">
              <label className="block space-y-2 text-sm text-zinc-700"><span className="font-medium text-zinc-900">Unassigned listing</span><select className={inputClass} defaultValue="" name="listingId" required><option disabled value="">Choose a listing</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {formatListingTypeLabel(listing.listingType)} · {listing.status.replaceAll("_", " ")}</option>)}</select></label>
              <InventorySubmitButton className="button-primary px-4 py-2 text-sm font-medium" pendingLabel="Assigning stock…">Assign one unit</InventorySubmitButton>
            </form>
          ) : <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">{summary.available < 1 ? "All recorded units are already assigned. Receive more stock or release an eligible unused listing before assigning another." : "There are no unassigned listings. Create a listing, then return here to link its stock."}</p>}
          <Link className="button-ghost px-0 py-0 text-sm font-medium" href="/admin/listings/new">Create a listing →</Link>
        </section>
      </div>

      <section aria-labelledby="item-returns" className="space-y-4">
        <div className="space-y-2"><h3 className="text-xl font-semibold text-zinc-950" id="item-returns">Listings and return per item</h3><p className="max-w-4xl text-sm text-zinc-600">Contribution is paid revenue, including shipping charged to the buyer, less the saved item cost and selling costs you enter. It is before overhead. Costs start at $0; complete payment fees, actual shipping, packaging, and other costs before using this as a final estimate.</p></div>
        {item.allocations.length === 0 ? <EmptyState description="Connect a listing to track its unit cost and the contribution from its paid sale." title="No listings assigned yet" /> : item.allocations.map((allocation) => {
          const result = getAllocationReturn(allocation);
          const canRelease = !result.sold && ["draft", "unsold", "archived"].includes(allocation.listing.status);
          return (
            <article className="surface-card space-y-5 p-5" key={allocation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2"><Link className="text-lg font-semibold text-emerald-800 underline-offset-4 hover:underline" href={`/admin/listings/${allocation.listing.id}`}>{allocation.listing.title}</Link><div className="flex flex-wrap gap-2"><StatusBadge status={allocation.listing.listingType} /><StatusBadge status={allocation.listing.status} /><StatusBadge label={result.fulfilled ? "Stock fulfilled" : result.sold ? "Paid; stock on hand" : "Unit set aside"} status={result.fulfilled ? "fulfilled" : result.sold ? "paid" : "pending"} /></div></div>
                <Link className="button-secondary px-3 py-2 text-sm" href={`/admin/orders?listingId=${allocation.listing.id}`}>View orders</Link>
              </div>
              <dl className="grid gap-4 rounded-lg bg-zinc-50 p-4 sm:grid-cols-3">
                <div><dt className="text-xs text-zinc-500">Saved item cost</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(allocation.unitCostCents)}</dd></div>
                <div><dt className="text-xs text-zinc-500">Paid revenue incl. shipping</dt><dd className="mt-1 font-semibold tabular-nums">{result.revenueCents === null ? "Awaiting paid sale" : formatMoney(result.revenueCents)}</dd></div>
                <div><dt className="text-xs text-zinc-500">Contribution using entered costs</dt><dd className={`mt-1 font-semibold tabular-nums ${result.contributionCents !== null && result.contributionCents < 0 ? "text-red-700" : "text-zinc-900"}`}>{result.contributionCents === null ? "Available after payment" : formatMoney(result.contributionCents)}</dd></div>
              </dl>
              <form action={updateAllocationSellingCostAction.bind(null, item.id, allocation.id)} className="flex flex-wrap items-end gap-3">
                <label className="min-w-48 flex-1 space-y-2 text-sm text-zinc-700"><span className="font-medium text-zinc-900">Total selling costs for this unit ($)</span><input className={inputClass} defaultValue={(allocation.sellingCostCents / 100).toFixed(2)} min={0} name="sellingCost" required step="0.01" type="number" /></label>
                <InventorySubmitButton className="button-secondary px-4 py-2 text-sm font-medium">Save selling costs</InventorySubmitButton>
              </form>
              {canRelease ? <div className="flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-4"><form action={releaseInventoryAllocationAction.bind(null, item.id, allocation.id)}><InventorySubmitButton className="button-ghost px-0 py-0 text-sm font-medium" pendingLabel="Releasing stock…">Release unused listing stock</InventorySubmitButton></form><p className="text-xs text-zinc-500">Listings with live bids, pending offers, active orders, or payment cannot be released.</p></div> : null}
            </article>
          );
        })}
      </section>

      <section aria-labelledby="inventory-history" className="surface-card overflow-hidden">
        <div className="space-y-1 border-b border-zinc-200 p-5"><h3 className="text-xl font-semibold text-zinc-950" id="inventory-history">Inventory history</h3><p className="text-sm text-zinc-600">Latest 100 recorded stock and cost changes. Paid and fulfilled counts follow linked orders above.</p></div>
        {item.movements.length === 0 ? <p className="p-5 text-sm text-zinc-600">No movements recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-4" scope="col">When</th><th className="p-4" scope="col">Change</th><th className="p-4" scope="col">Units</th><th className="p-4" scope="col">Unit cost</th><th className="p-4" scope="col">Reason / reference</th></tr></thead><tbody className="divide-y divide-zinc-100">{item.movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap p-4 text-xs text-zinc-500">{formatUtcDateTime(movement.createdAtUtc)}</td><td className="p-4">{movementLabels[movement.kind] ?? movement.kind.replaceAll("_", " ")}</td><td className="p-4 tabular-nums">{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</td><td className="p-4 tabular-nums">{formatMoney(movement.unitCostCents)}</td><td className="p-4"><p>{movement.reason}</p>{movement.reference ? <p className="mt-1 break-all text-xs text-zinc-500">{movement.reference}</p> : null}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
