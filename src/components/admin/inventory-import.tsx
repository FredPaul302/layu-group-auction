"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { formatMoney } from "@/lib/catalog";
import type { InventoryImportState } from "@/lib/inventory/actions";
import { INVENTORY_MAX_CSV_BYTES, inventoryCsvTemplate, parseInventoryCsv } from "@/lib/inventory/rules";

type InventoryImportProps = {
  action: (state: InventoryImportState, formData: FormData) => Promise<InventoryImportState>;
  initialCsv?: string;
};

const inputClass = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2";

export function InventorySubmitButton({
  children,
  pendingLabel = "Saving…",
  className
}: { children: ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? pendingLabel : children}</button>;
}

export function InventoryImport({ action, initialCsv = "" }: InventoryImportProps) {
  const [reference, setReference] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [csv, setCsv] = useState(initialCsv);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [state, formAction, pending] = useActionState(action, { error: null });
  const preview = useMemo(() => {
    if (!csv.trim()) return { lines: [], error: null };
    try {
      return { lines: parseInventoryCsv(csv), error: null };
    } catch (error) {
      return { lines: [], error: error instanceof Error ? error.message : "Check the CSV format." };
    }
  }, [csv]);
  const totalUnits = preview.lines.reduce((total, line) => total + line.quantity, 0);
  const totalCost = preview.lines.reduce((total, line) => total + line.quantity * line.unitCostCents, 0);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    if (file.size > INVENTORY_MAX_CSV_BYTES) {
      setFileError("Choose a CSV file no larger than 100 KB, or split it into separate purchase orders.");
      return;
    }
    setReadingFile(true);
    try {
      setCsv(await file.text());
    } catch {
      setFileError("The file could not be read. Try again or paste its CSV text below.");
    } finally {
      setReadingFile(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Purchase order reference</span>
          <input className={inputClass} maxLength={120} name="reference" onChange={(event) => setReference(event.currentTarget.value)} placeholder="PO-2026-001" required value={reference} />
        </label>
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Supplier</span>
          <input className={inputClass} maxLength={200} name="supplier" onChange={(event) => setSupplier(event.currentTarget.value)} required value={supplier} />
        </label>
        <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
          <span className="font-medium text-zinc-900">Notes</span>
          <textarea className={inputClass} maxLength={2000} name="notes" onChange={(event) => setNotes(event.currentTarget.value)} rows={2} value={notes} />
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-950">Upload purchase items</h3>
            <p className="mt-1 text-sm text-zinc-600">Use a CSV spreadsheet with the columns shown in the template. Enter unit costs in dollars.</p>
          </div>
          <a className="button-secondary px-3 py-2 text-sm" download="inventory-purchase-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(inventoryCsvTemplate)}`}>
            Download CSV template
          </a>
        </div>
        <label className="block space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Choose CSV file</span>
          <input accept=".csv,text/csv" className={inputClass} disabled={pending || readingFile} onChange={(event) => void readFile(event.currentTarget.files?.[0])} type="file" />
        </label>
        <label className="block space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">CSV text</span>
          <textarea className={`${inputClass} font-mono text-xs`} maxLength={INVENTORY_MAX_CSV_BYTES} name="csv" onChange={(event) => { setCsv(event.currentTarget.value); setFileError(null); }} placeholder={inventoryCsvTemplate} required rows={7} spellCheck={false} value={csv} />
        </label>
        <p className="text-xs text-zinc-600">Opening stock can use a purchase order reference such as OPENING-001. Include allocated inbound freight in unit cost if you want it included in item contribution. PDF and image purchase orders need to be converted to this CSV format first.</p>
      </div>

      {readingFile ? <p className="text-sm text-zinc-600" role="status">Reading file…</p> : null}
      {fileError || preview.error || state.error ? <p className="notice notice-danger" role="alert">{fileError ?? preview.error ?? state.error}</p> : null}

      {preview.lines.length > 0 ? (
        <section aria-label="Purchase order preview" className="space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <h3 className="font-semibold text-zinc-950">Review before saving</h3>
            <p className="text-sm text-zinc-700">{preview.lines.length} SKUs · {totalUnits} units · {formatMoney(totalCost)} purchase cost</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3" scope="col">SKU / item</th><th className="p-3" scope="col">Units</th><th className="p-3" scope="col">Unit cost</th><th className="p-3" scope="col">Location</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {preview.lines.slice(0, 25).map((line) => (
                  <tr key={line.sku}><td className="p-3"><span className="font-medium">{line.sku}</span><br />{line.title}</td><td className="p-3 tabular-nums">{line.quantity}</td><td className="p-3 tabular-nums">{formatMoney(line.unitCostCents)}</td><td className="p-3">{line.location ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.lines.length > 25 ? <p className="text-xs text-zinc-600">Showing the first 25 rows. All {preview.lines.length} rows will be saved.</p> : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button className="button-primary px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={pending || readingFile || Boolean(fileError) || preview.lines.length === 0} type="submit">
          {pending ? "Saving purchase order…" : "Save purchase order draft"}
        </button>
        <p className="text-sm text-zinc-600">Stock changes only after you receive the saved order.</p>
      </div>
    </form>
  );
}
