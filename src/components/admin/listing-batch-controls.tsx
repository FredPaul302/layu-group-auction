"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function ListingBatchControls({ listings, allSelected = false, onPublished, onDeleted }: {
  listings: { id: string; title: string; status: string }[]; allSelected?: boolean; onPublished?: (ids: string[]) => void; onDeleted?: (ids: string[]) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(allSelected ? listings.map((item) => item.id) : []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const current = selected.filter((id) => listings.some((item) => item.id === id));
  async function act(action: "publish" | "delete") {
    if (busy || !current.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/listings/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids: current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "The action failed.");
      setMessage(result.message); setSelected([]); setDeleteConfirm(false);
      if (action === "publish") onPublished?.(current);
      if (action === "delete") onDeleted?.(current);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check your connection and refresh before retrying."); }
    finally { setBusy(false); }
  }
  return <section className="surface-card space-y-3 p-4" aria-label="Bulk listing actions">
    <div className="bulk-action-bar flex flex-wrap items-center gap-3">
      <strong>{current.length} selected</strong>
      <button type="button" className="button-secondary px-3 py-2" disabled={busy} onClick={() => { setSelected(listings.filter((item) => item.status === "draft").slice(0, 100).map((item) => item.id)); setDeleteConfirm(false); }}>Select drafts</button>
      <button type="button" className="button-secondary px-3 py-2" disabled={busy} onClick={() => { setSelected(listings.slice(0, 100).map((item) => item.id)); setDeleteConfirm(false); }}>Select all shown</button>
      <button type="button" className="button-ghost px-3 py-2" disabled={busy} onClick={() => { setSelected([]); setDeleteConfirm(false); }}>Clear selection</button>
      <button type="button" className="button-primary px-3 py-2" disabled={busy || !current.length || current.some((id) => listings.find((item) => item.id === id)?.status !== "draft")} onClick={() => void act("publish")}>{busy ? "Working…" : "Publish selected"}</button>
      <button type="button" className="button-secondary px-3 py-2 text-red-700" disabled={busy || !current.length} onClick={() => setDeleteConfirm(true)}>Delete selected</button>
      {current.length && !busy ? <Link className="button-secondary px-3 py-2" href={`/admin/cross-listing?${new URLSearchParams({ items: current.join(",") })}`}>List selected elsewhere</Link> : null}
    </div>
    <p className="text-sm">Select up to 100 listings. Only drafts can be published here. Listings with any bids, orders, or offers cannot be deleted.</p>
    {deleteConfirm ? <div className="notice notice-danger space-y-2"><p>Delete {current.length} selected listing{current.length === 1 ? "" : "s"}? This permanently removes them from the catalog and admin list. This cannot be undone.</p>
      <button type="button" className="button-secondary px-3 py-2" disabled={busy} onClick={() => void act("delete")}>Confirm deletion</button>{" "}
      <button type="button" className="button-ghost px-3 py-2" disabled={busy} onClick={() => setDeleteConfirm(false)}>Cancel</button></div> : null}
    {message ? <p className="notice notice-info" role="status">{message}</p> : null}
    <div className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
      {listings.map((item) => <label key={item.id} className="flex items-center gap-3 rounded border border-zinc-200 p-3 text-sm">
        <input type="checkbox" aria-label={`Select ${item.title}`} checked={current.includes(item.id)} disabled={busy || (!current.includes(item.id) && current.length >= 100)}
          onChange={(event) => { setSelected(event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)); setDeleteConfirm(false); }} />
        <span>{item.title} <span className="text-xs">({item.status})</span></span>
      </label>)}
    </div>
  </section>;
}
