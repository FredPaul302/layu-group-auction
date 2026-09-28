import Link from "next/link";

import { InventoryImport, InventorySubmitButton } from "@/components/admin/inventory-import";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth";
import { formatMoney, formatUtcDateTime } from "@/lib/catalog/presentation";
import { createPurchaseOrderAction, receivePurchaseOrderAction } from "@/lib/inventory/actions";
import { listPurchaseOrders } from "@/lib/inventory/service";

import { InventoryFeedback, type InventorySearchParams } from "../inventory-feedback";

export default async function AdminPurchaseOrdersPage({
  searchParams
}: { searchParams?: Promise<InventorySearchParams> }) {
  const admin = await requireAdminUser();
  const params = await (searchParams ?? Promise.resolve({} as InventorySearchParams));
  const orders = await listPurchaseOrders(admin.id);

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader actions={<Link className="button-secondary px-4 py-2 text-sm font-medium" href="/admin/inventory">View inventory</Link>} description={<p>Upload a purchase order, review the items, and save a draft. Receive the saved order when its goods arrive to add them to inventory.</p>} eyebrow="Admin · Inventory" title="Purchase orders" />
      <InventoryFeedback params={params} />

      <section aria-labelledby="new-purchase-order" className="surface-card space-y-5 p-5 sm:p-6">
        <div className="space-y-1"><h3 className="text-xl font-semibold text-zinc-950" id="new-purchase-order">New purchase order</h3><p className="text-sm text-zinc-600">Use one unique reference per purchase. Receiving an order records all its lines together.</p></div>
        <InventoryImport action={createPurchaseOrderAction} />
      </section>

      <section aria-labelledby="saved-purchase-orders" className="space-y-4">
        <h3 className="text-xl font-semibold text-zinc-950" id="saved-purchase-orders">Saved purchase orders</h3>
        {orders.length === 0 ? <EmptyState description="Your saved drafts and received purchases will appear here." title="No purchase orders yet" /> : orders.map((order) => {
          const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          const costCents = order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
          return (
            <article className="surface-card space-y-4 p-5" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h4 className="text-lg font-semibold text-zinc-950">{order.reference}</h4><StatusBadge label={order.receivedAtUtc ? "Received" : "Awaiting receipt"} status={order.receivedAtUtc ? "approved" : "draft"} /></div><p className="text-sm text-zinc-700">{order.supplier} · {order.lines.length} SKUs · {units} units · {formatMoney(costCents)}</p><p className="text-xs text-zinc-500">{order.receivedAtUtc ? `Received ${formatUtcDateTime(order.receivedAtUtc)}` : `Saved ${formatUtcDateTime(order.createdAtUtc)}`}</p></div>
                {!order.receivedAtUtc ? <form action={receivePurchaseOrderAction.bind(null, order.id)}><InventorySubmitButton className="button-primary px-4 py-2 text-sm font-medium" pendingLabel="Receiving stock…">Receive all {units} units</InventorySubmitButton></form> : null}
              </div>
              {order.notes ? <p className="whitespace-pre-wrap text-sm text-zinc-600">{order.notes}</p> : null}
              <details className="rounded-lg border border-zinc-200">
                <summary className="cursor-pointer p-3 text-sm font-medium text-zinc-800">Review purchase items</summary>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3" scope="col">SKU / item</th><th className="p-3" scope="col">Units</th><th className="p-3" scope="col">Unit cost</th><th className="p-3" scope="col">Location</th></tr></thead><tbody className="divide-y divide-zinc-100">{order.lines.map((line) => <tr key={line.id}><td className="p-3"><span className="font-medium">{line.sku}</span><br />{line.title}</td><td className="p-3 tabular-nums">{line.quantity}</td><td className="p-3 tabular-nums">{formatMoney(line.unitCostCents)}</td><td className="p-3">{line.location ?? "—"}</td></tr>)}</tbody></table></div>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}
