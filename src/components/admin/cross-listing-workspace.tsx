"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { crossListingChannels, getCrossListingChannel, type CrossListingChannel } from "@/lib/cross-listing/channels";
import type { CrossListingView } from "@/lib/cross-listing/service";

const statusLabels: Record<string, string> = { ready: "Ready to review", blocked: "Needs item details", sending: "Sending — do not retry", posted: "Posted", external_draft: "Draft at destination", review: "Check destination before retrying", removed: "External offer removed / promotion updated", error: "Send failed — review before retry" };
const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2";
async function requestAction(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/cross-listing/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "The result could not be confirmed. Refresh before retrying.");
  return result.message as string;
}
function downloadUrl(ids: string[], format: string) { return `/api/admin/cross-listing/download?${new URLSearchParams({ ids: ids.join(","), format })}`; }

function DestinationCard({ row, selected, onSelect, onDirty, message, setMessage, expanded, setExpanded, disabled }: { row: CrossListingView; selected: boolean; onSelect: (checked: boolean) => void; onDirty: (dirty: boolean) => void; message: string; setMessage: (message: string) => void; expanded: boolean; setExpanded: (open: boolean) => void; disabled: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState(row.edit);
  const [externalUrl, setExternalUrl] = useState(row.externalUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const channel = getCrossListingChannel(row.channel);
  const dirty = JSON.stringify(fields) !== JSON.stringify(row.edit);
  function edit(next: typeof fields) { setFields(next); onDirty(JSON.stringify(next) !== JSON.stringify(row.edit)); }
  const exportReady = row.item.ready && !row.sourceChanged && !row.issues.length;
  async function act(action: string) {
    if (busy || disabled) return;
    setBusy(true); setMessage("");
    try { setMessage(await requestAction(row.id, { action, version: row.version, fields, externalUrl, checked })); onDirty(false); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action could not be confirmed."); router.refresh(); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMessage("Copied. Paste it into the destination's listing form."); }
    catch { setMessage("Copy was unavailable. Use Download text instead."); }
  }
  return <article className="surface-card space-y-3 p-5">
    <div className="flex items-start gap-3">
      <input type="checkbox" className="mt-1" checked={selected} disabled={busy || disabled} aria-label={`Select ${row.item.title} for ${channel.label}`} onChange={(event) => onSelect(event.target.checked)} />
      <div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">{row.item.title}</h3><p className="text-sm">{channel.label} · <strong>{row.needsRemoval ? "Action needed after sale or removal" : statusLabels[row.status] ?? row.status}</strong></p></div>
    </div>
    {row.issues.length ? <div className="notice notice-warning space-y-1">{row.issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
    {row.lastError ? <p className="notice notice-warning">{row.lastError}</p> : null}
    <details className="space-y-4" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold text-blue-700">Review details, photos & posting options</summary>
      <div className="flex flex-wrap gap-2 text-sm">
        {row.listingId ? <Link href={`/admin/listings/${row.listingId}`} className="button-ghost px-3 py-2">Layu listing</Link> : null}
        <a href={row.externalUrl ?? channel.openUrl} target="_blank" rel="noopener noreferrer" className="button-secondary px-3 py-2">{row.externalUrl ? "Open saved external listing" : `Open ${channel.label}`}</a>
        {row.listingId ? <a href={`/api/admin/cross-listing/${row.id}/photos`} className="button-secondary px-3 py-2">Download photos (.zip)</a> : null}
        {exportReady && !dirty ? <>
          <button type="button" className="button-secondary px-3 py-2" onClick={() => void copy(row.item.title)}>Copy title</button>
          <button type="button" className="button-secondary px-3 py-2" onClick={() => void copy(row.item.description)}>Copy description</button>
          <a href={downloadUrl([row.id], "text")} className="button-secondary px-3 py-2">Download text</a>
        </> : null}
      </div>
      <p className="text-sm">{channel.summary}</p>
      {row.editable ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void act("save"); }}>
        <p className="text-sm">Edits here are saved only for {channel.label}. Save before copying or sending.</p>
        <label className="block space-y-1"><span>Title</span><input className={inputClass} value={fields.title} maxLength={200} required disabled={busy || disabled} onChange={(event) => edit({ ...fields, title: event.target.value })} /></label>
        <label className="block space-y-1"><span>Description</span><textarea className={inputClass} rows={5} value={fields.description} maxLength={20000} required disabled={busy || disabled} onChange={(event) => edit({ ...fields, description: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1"><span>Condition</span><input className={inputClass} value={fields.conditionNote} maxLength={2000} disabled={busy || disabled} onChange={(event) => edit({ ...fields, conditionNote: event.target.value })} /></label>
          {row.item.mode === "item" || row.item.priceCents !== null ? <label className="block space-y-1"><span>Price ($)</span><input className={inputClass} inputMode="decimal" value={fields.price} disabled={busy || disabled} onChange={(event) => edit({ ...fields, price: event.target.value })} /></label> : null}
        </div>
        <div className="flex flex-wrap gap-3"><button className="button-primary px-4 py-2" disabled={busy || disabled}>Save destination details</button>
          {row.sourceChanged && !dirty ? <button type="button" className="button-secondary px-4 py-2" disabled={busy || disabled} onClick={() => void act("refresh")}>Review latest Layu details</button> : null}</div>
      </form> : null}
      <div className="surface-elevated space-y-2 rounded-lg p-4"><p className="font-semibold">Saved posting preview{row.item.priceDollars ? ` · $${row.item.priceDollars}` : ""}</p><p className="whitespace-pre-wrap text-sm">{row.item.description}</p>
        <div className="flex flex-wrap gap-3">{row.item.photos.map((photo) => <a key={photo.position} href={photo.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">View photo {photo.position}</a>)}</div>
      </div>
      {row.item.warnings.map((warning) => <p key={warning} className="text-sm">{warning}</p>)}
      {(row.editable && exportReady && !dirty) || row.canResolve ? <div className="space-y-2 border-t border-zinc-200 pt-4">
        <label className="block space-y-1"><span>{row.channel === "shopify" ? "Existing Shopify draft address" : "Published listing or post address"}</span><input type="url" className={inputClass} value={externalUrl} placeholder="https://…" onChange={(event) => setExternalUrl(event.target.value)} /></label>
        <button type="button" className="button-secondary px-4 py-2" disabled={busy || disabled || !externalUrl.trim()} onClick={() => void act("mark_posted")}>{row.channel === "shopify" ? "Record existing draft" : "I posted it — save link"}</button>
      </div> : null}
      {row.canResolve ? <div className="notice notice-warning space-y-3"><p>The earlier send may have succeeded. Open your destination account and look for the item first. If it exists, save its address above.</p>
        <label className="flex gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />I checked the destination account and confirmed no post or product was created.</label>
        <button type="button" className="button-secondary px-4 py-2" disabled={busy || disabled || !checked} onClick={() => void act("not_created")}>Allow another reviewed attempt</button>
      </div> : ["posted", "external_draft"].includes(row.status) ? <div className="space-y-3">
        <p className="text-sm">Sales and inventory are not automatically synchronized. If this item sells elsewhere, archive the Layu offer promptly and handle the external sale in that service.</p>
        <label className="flex gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />I removed the external offer, or updated the promotion to show it is no longer available.</label>
        <button type="button" className="button-secondary px-4 py-2" disabled={busy || disabled || !checked} onClick={() => void act("mark_removed")}>Record removal / updated promotion</button>
      </div> : null}
    </details>
    {message ? <p className="notice notice-info" role="status">{message}</p> : null}
  </article>;
}

export function CrossListingWorkspace({ listings, rows, initialIds }: { listings: { id: string; title: string; listingType: string; status: string }[]; rows: CrossListingView[]; initialIds: string[] }) {
  const router = useRouter();
  const [listingIds, setListingIds] = useState<string[]>(initialIds);
  const [channels, setChannels] = useState<CrossListingChannel[]>(["facebook_page"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [dirtyRows, setDirtyRows] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<string[]>(rows.filter((row) => row.canResolve).map((row) => row.id));
  const [channelFilter, setChannelFilter] = useState("all");
  const shown = rows.filter((row) => channelFilter === "all" || row.channel === channelFilter);
  const current = rows.filter((row) => selected.includes(row.id));
  const sendable = current.filter((row) => row.canSend);
  const unsaved = current.some((row) => dirtyRows.includes(row.id));
  const exportable = !unsaved && current.length > 0 && current.every((row) => row.item.ready && !row.sourceChanged && !row.issues.length);
  async function prepare() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/cross-listing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingIds, channels }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "Preparation failed.");
      setMessage(result.message); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preparation failed. Your Layu listings are unchanged."); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!confirm || !sendable.length || busy || unsaved) return;
    setBusy(true); setMessage("");
    let done = 0;
    try {
      for (const row of sendable) {
        setMessage(`Sending ${done + 1} of ${sendable.length}: ${row.item.title}. Keep this page open.`);
        await requestAction(row.id, { action: "send", version: row.version, checked: true }); done++;
      }
      setMessage(`${done} destination records sent. Facebook promotions are posted; Shopify products remain drafts. Other destinations still need manual posting.`);
    } catch (error) { setMessage(`${done} completed. ${error instanceof Error ? error.message : "The last result is uncertain."} Remaining items were not sent. Refresh and review before continuing.`); }
    finally { setConfirm(false); setSelected([]); setBusy(false); router.refresh(); }
  }
  return <div className="space-y-8">
    <section className="surface-card space-y-4 p-5">
      <h2 className="text-xl font-semibold">1. Choose listings and destinations</h2>
      <p>Prepare up to 100 items at a time. Auctions can be promoted on your business Page; fixed-price items can be prepared for the other marketplaces.</p>
      <div className="flex flex-wrap gap-3"><button type="button" className="button-secondary px-3 py-2" disabled={busy} onClick={() => setListingIds(listings.slice(0, 100).map((listing) => listing.id))}>Select all shown</button><button type="button" className="button-ghost px-3 py-2" disabled={busy} onClick={() => setListingIds([])}>Clear</button><span>{listingIds.length} items selected</span></div>
      <div className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">{listings.map((listing) => <label key={listing.id} className="flex gap-3 rounded border border-zinc-200 p-3 text-sm"><input type="checkbox" checked={listingIds.includes(listing.id)} disabled={busy || (!listingIds.includes(listing.id) && listingIds.length >= 100)} onChange={(event) => setListingIds(event.target.checked ? [...listingIds, listing.id] : listingIds.filter((id) => id !== listing.id))} /><span>{listing.title} <span className="text-xs">· {listing.listingType === "auction" ? "Auction" : "Fixed price"} · {listing.status}</span></span></label>)}</div>
      {!listings.length ? <p>No matching listings. Create or publish your items first.</p> : null}
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">Destinations</legend>{crossListingChannels.map((channel) => <label key={channel.id} className="flex gap-3 rounded border border-zinc-200 p-3"><input type="checkbox" checked={channels.includes(channel.id)} disabled={busy} onChange={(event) => setChannels(event.target.checked ? [...channels, channel.id] : channels.filter((id) => id !== channel.id))} /><span><strong>{channel.label}</strong><span className="block text-sm">{channel.summary}</span></span></label>)}</fieldset>
      <button type="button" className="button-primary px-4 py-2" disabled={busy || !listingIds.length || !channels.length} onClick={() => void prepare()}>{busy ? "Working…" : "Prepare selected items"}</button>
      <p className="text-sm">Preparing saves your work here. It does not create an external listing or incur a posting fee.</p>
    </section>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">2. Review, export, or send</h2>
      <div className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-3"><label>Show <select className="rounded border border-zinc-300 px-3 py-2" value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setSelected([]); setConfirm(false); }} disabled={busy}><option value="all">All destinations</option>{crossListingChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}</select></label>
          <button type="button" className="button-secondary px-3 py-2" disabled={busy} onClick={() => { setSelected(shown.map((row) => row.id)); setConfirm(false); }}>Select all shown</button><button type="button" className="button-ghost px-3 py-2" disabled={busy} onClick={() => { setSelected([]); setConfirm(false); }}>Clear</button><strong>{current.length} selected</strong></div>
        {exportable ? <div className="flex flex-wrap gap-3"><a className="button-secondary px-3 py-2" href={downloadUrl(current.map((row) => row.id), "text")}>Download selected text</a><a className="button-secondary px-3 py-2" href={downloadUrl(current.map((row) => row.id), "json")}>Download all details</a>{current.every((row) => row.channel === "shopify") ? <a className="button-secondary px-3 py-2" href={downloadUrl(current.map((row) => row.id), "shopify")}>Download Shopify draft CSV</a> : null}</div> : current.length ? <p className="text-sm">Resolve the selected records&apos; issues before exporting.</p> : null}
        {sendable.length ? <div className="notice notice-info space-y-3"><p>Send {sendable.filter((row) => row.channel === "facebook_page").length} Facebook Page promotions and create {sendable.filter((row) => row.channel === "shopify").length} Shopify drafts. {current.length - sendable.length} selected records need manual posting or setup.</p>
          <label className="flex gap-2"><input type="checkbox" checked={confirm} disabled={busy} onChange={(event) => setConfirm(event.target.checked)} />I reviewed the saved previews and approve these posts and drafts.</label>
          {unsaved ? <p>Save the selected records&apos; edits before sending.</p> : null}
          <button type="button" className="button-primary px-4 py-2" disabled={busy || !confirm || unsaved} onClick={() => void send()}>Send {sendable.length} reviewed records</button></div> : <p className="text-sm">Use copy and download for manual destinations. <Link className="underline" href="/admin/connections">Set up connections</Link> to send Facebook Page promotions or Shopify drafts.</p>}
      </div>
      {message ? <p className="notice notice-info" role="status">{message}</p> : null}
      {shown.map((row) => <DestinationCard key={`${row.id}:${row.version}`} row={row} selected={selected.includes(row.id)} disabled={busy} message={feedback[row.id] ?? ""} setMessage={(message) => setFeedback((previous) => ({ ...previous, [row.id]: message }))} expanded={expandedRows.includes(row.id)} setExpanded={(open) => setExpandedRows((previous) => open ? [...new Set([...previous, row.id])] : previous.filter((id) => id !== row.id))} onDirty={(dirty) => { setDirtyRows((previous) => dirty ? [...new Set([...previous, row.id])] : previous.filter((id) => id !== row.id)); setConfirm(false); }} onSelect={(checked) => { setSelected(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id)); setConfirm(false); }} />)}
      {!shown.length ? <p>No prepared records on this page yet. Choose listings and destinations above.</p> : null}
    </section>
  </div>;
}
