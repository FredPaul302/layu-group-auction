"use client";
import { useEffect, useRef, useState } from "react";
import { PhotoThumbnails } from "./photo-thumbnails";
import { listingImageMaxSizeBytes } from "@/lib/catalog";
import { bulkListingMaxRequestSizeBytes, bulkListingMaxWorkspaceSizeBytes } from "@/lib/catalog/bulk-listings";
import { formatPhotoSize, photoInboxMaxCount } from "@/lib/catalog/photo-inbox-validation";
import { checkInboxPhotos, uploadInboxPhoto, type CheckedInboxPhoto, type SavedInboxPhoto } from "@/lib/catalog/upload-inbox-photo";
import { photoDateLabel, photoSortOptions, sortInboxPhotos, type PhotoSortOrder } from "@/lib/catalog/photo-inbox-presentation";

type UploadEntry = Omit<CheckedInboxPhoto, "status"> & { status: CheckedInboxPhoto["status"] | "uploading" | "saved" };
export function PhotoInbox({ currentFiles = [], onUsePhotos, disabled = false }: { currentFiles?: File[]; onUsePhotos: (photos: SavedInboxPhoto[]) => void; disabled?: boolean }) {
  const [photos, setPhotos] = useState<SavedInboxPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [isError, setIsError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sort, setSort] = useState<PhotoSortOrder>("photo_newest");
  const [checking, setChecking] = useState<string>("");
  const upload = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const saved = localStorage.getItem("layu-photo-inbox-sort");
        if (photoSortOptions.some(([value]) => value === saved)) setSort(saved as PhotoSortOrder);
      } catch { /* Sorting still works when browser storage is unavailable. */ }
      try {
        const response = await fetch("/api/admin/photos", { cache: "no-store" });
        if (!response.ok || response.redirected) return;
        const data = await response.json();
        if (mounted && !running.current) { setPhotos(data.photos); setOpen(true); }
      } catch { /* The refresh button allows another attempt without blocking the workspace. */ }
    };
    void restore();
    return () => { mounted = false; };
  }, []);
  const sortedPhotos = sortInboxPhotos(photos, sort);
  const selectedPhotos = sortedPhotos.filter((photo) => selected.includes(photo.id));
  const selectedSize = selectedPhotos.reduce((total, photo) => total + photo.sizeBytes, 0);
  const latest = sortInboxPhotos(photos, "upload_newest")[0];
  const readyCount = entries.filter((entry) => entry.status === "ready").length;
  async function load() {
    const response = await fetch("/api/admin/photos", { cache: "no-store" });
    if (!response.ok || response.redirected) throw new Error("Sign in again to view your saved photos.");
    const data: { photos: SavedInboxPhoto[] } = await response.json();
    setPhotos(data.photos);
    setSelected((current) => current.filter((id) => data.photos.some((photo) => photo.id === id)));
    setDeleteConfirm(false); setOpen(true);
  }
  async function run(work: () => Promise<void>) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setMessage(""); setIsError(false);
    try { await work(); } catch (error) { setIsError(true); setMessage(error instanceof Error ? error.message : "The request failed. Check your connection and try again."); }
    finally { running.current = false; setBusy(false); }
  }
  async function check(files: File[]) {
    setEntries([]); setChecking(`Checking 0 of ${files.length} photos…`);
    try {
      const checked = await checkInboxPhotos(files, fetch, (count) => setChecking(`Checking ${count} of ${files.length} photos…`));
      setEntries(checked);
      const ready = checked.filter((entry) => entry.status === "ready").length;
      const duplicates = checked.filter((entry) => entry.status === "duplicate").length;
      setIsError(checked.some((entry) => entry.status === "failed"));
      setMessage(`${ready} new photo${ready === 1 ? "" : "s"} ready. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} will be skipped. ${ready ? "Review the selection, then choose Upload new photos below." : "No new photos to upload."}`);
    } finally { setChecking(""); }
  }
  async function save() {
    const queue = entries.map((entry) => ({ ...entry }));
    const update = () => setEntries(queue.map((entry) => ({ ...entry })));
    update();
    for (const entry of queue) {
      if (entry.status !== "ready") continue;
      entry.status = "uploading"; update();
      try {
        const saved = await uploadInboxPhoto(entry.file);
        setPhotos((existing) => [saved, ...existing.filter((photo) => photo.id !== saved.id)]);
        setOpen(true); entry.status = saved.alreadySaved ? "duplicate" : "saved"; entry.existing = saved;
      } catch (error) {
        entry.status = "failed";
        entry.error = error instanceof Error ? error.message : "This photo could not be saved. Check your connection and retry.";
      }
      update();
    }
    const saved = queue.filter((entry) => entry.status === "saved").length;
    const duplicates = queue.filter((entry) => entry.status === "duplicate").length;
    const failed = queue.filter((entry) => entry.status === "failed").length;
    // A refresh failure must not turn already confirmed saves into failed uploads.
    let refreshWarning = "";
    try { await load(); } catch { refreshWarning = " The full inbox could not refresh; use Show saved photos / Refresh to see older photos."; }
    setIsError(failed > 0);
    setMessage(`${saved} new photo${saved === 1 ? "" : "s"} saved. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.${failed ? ` ${failed} photos need attention; see the details below. Successfully saved photos do not need to be uploaded again.` : " You can close this page and continue on another device using the same account."}${refreshWarning}`);
  }
  async function useSelected() {
    if (selectedSize > bulkListingMaxWorkspaceSizeBytes) throw new Error("Choose up to 1 GB of saved photos for one batch.");
    onUsePhotos(selectedPhotos); setSelected([]); setMessage(`${selectedPhotos.length} selected photos are ready in this workspace. Assign them to items below. Your saved copies remain in the inbox.`);
  }
  return <section className="surface-card space-y-4 p-5" aria-label="Saved photo inbox">
    <div><p className="eyebrow">Start on your phone, finish on your computer</p><h3 className="text-xl font-semibold">Photo inbox</h3></div>
    <p className="text-sm">Upload photos now without creating or assigning a listing. They are saved privately to your account. Sign in with the same account on another device, open this inbox, and choose photos for your batch.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="button-primary cursor-pointer px-4 py-2 text-sm">Upload photos for later
        <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Upload photos for later" disabled={busy || disabled}
          onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void run(() => check(files)); }} />
      </label>
      <button type="button" className="button-secondary px-4 py-2 text-sm" disabled={busy || disabled} onClick={() => void run(load)}>Show saved photos / Refresh</button>
      {currentFiles.some((file) => file.type.startsWith("image/")) ? <button type="button" className="button-secondary px-4 py-2 text-sm" disabled={busy || disabled} onClick={() => void run(() => check(currentFiles.filter((file) => file.type.startsWith("image/"))))}>Save workspace photos for later</button> : null}
    </div>
    <p className="notice notice-info text-sm">Choose photos from your phone, including any you are unsure about. We check for identical files already in your inbox before you upload. Your phone’s photo picker cannot show these checks; the results appear here after selection. Edited or recompressed copies may count as new photos.</p>
    <p className="text-sm">JPEG, PNG, WebP · up to {listingImageMaxSizeBytes / (1024 * 1024)} MB each, {bulkListingMaxRequestSizeBytes / (1024 * 1024)} MB per selection, and {photoInboxMaxCount} photos at a time. Photos save one at a time. Keep this page open until the saved confirmation appears.</p>
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Tips for phone and cloud photos</summary><p className="mt-2">For iCloud, Google Photos, OneDrive, or other cloud storage, download the original photos to your device before selecting them. Export HEIC photos as JPEG. If a photo fails, its filename, size, and reason appear below. Retrying checks for saved copies again, including after a connection error. Videos and unfinished listing text are not saved in this inbox.</p></details>
    {busy ? <p role="status">{checking || (entries.some((entry) => entry.status === "uploading") ? `Saving “${entries.find((entry) => entry.status === "uploading")?.file.name}”…` : "Working with your photos…")} Keep this page open.</p> : null}
    {message ? <p role={isError ? "alert" : "status"} className={`notice ${isError ? "notice-danger" : "notice-info"}`}>{message}</p> : null}
    {entries.length ? <div className="space-y-2" aria-label="Photo upload progress">
      <p className="text-sm font-semibold">{entries.length} photos · {formatPhotoSize(entries.reduce((total, entry) => total + entry.file.size, 0))} selected · {entries.filter((entry) => entry.status === "saved").length} saved</p>
      {readyCount ? <button type="button" className="button-primary px-4 py-2 text-sm" disabled={busy || disabled} onClick={() => void run(save)}>Upload {readyCount} new {readyCount === 1 ? "photo" : "photos"}</button> : null}
      <progress className="w-full" aria-label="Photos processed" max={entries.length} value={entries.filter((entry) => ["saved", "duplicate", "failed"].includes(entry.status)).length} />
      <ul className="max-h-64 space-y-2 overflow-auto text-sm">{entries.map((entry, index) => <li key={index} className="break-words rounded-lg border border-zinc-200 p-2">
        <span className="font-semibold">{entry.file.name}</span> · {formatPhotoSize(entry.file.size)} · {entry.status === "saved" ? "Saved" : entry.status === "duplicate" ? (entry.existing ? "Already in your inbox — skipped" : "Duplicate in this selection — skipped") : entry.status === "failed" ? "Needs attention" : entry.status === "uploading" ? "Reading and uploading…" : "New photo — ready to upload"}
        {entry.status === "duplicate" && entry.existing ? <p className="mt-1">Saved as {entry.existing.fileName} · {photoDateLabel(entry.existing)}</p> : null}
        {entry.error ? <p className="mt-1 text-red-700">{entry.error}</p> : null}
      </li>)}</ul>
      {entries.some((entry) => entry.status === "failed") ? <button type="button" className="button-secondary px-3 py-2 text-sm" disabled={busy || disabled} onClick={() => void run(() => check(entries.filter((entry) => entry.status === "failed" || entry.status === "ready").map((entry) => entry.file)))}>Recheck photos needing attention</button> : null}
    </div> : null}
    {open ? <>
      {latest ? <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="w-32 shrink-0"><PhotoThumbnails images={[{ id: `latest-${latest.id}`, filename: latest.fileName, src: `/api/admin/photos/${latest.id}` }]} /></div>
        <div className="min-w-0 space-y-1 break-words text-sm"><p className="font-semibold">Most recently saved to your inbox</p><p>{latest.fileName}</p><p>{photoDateLabel(latest)}</p><p>Saved {new Date(latest.createdAtUtc).toLocaleString()}</p></div>
      </div> : null}
      <div className="space-y-2"><label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Sort saved photos
        <select className="rounded-lg border border-zinc-300 bg-white p-2" value={sort} onChange={(event) => { const value = event.target.value as PhotoSortOrder; setSort(value); try { localStorage.setItem("layu-photo-inbox-sort", value); } catch { /* Optional preference. */ } }}>
          {photoSortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label><p className="text-sm">Photo date uses the camera’s capture time when available, then the original file date, then upload time. Each photo shows which date is used. Dates display in your device’s time zone.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <strong aria-live="polite">{photos.length} saved photos · {selected.length} selected{selected.length ? ` · ${formatPhotoSize(selectedSize)}` : ""}</strong>
        <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busy || disabled || selectedPhotos.length === photos.length} onClick={() => { setSelected(sortedPhotos.map((photo) => photo.id)); setDeleteConfirm(false); }}>Select all</button>
        <button className="button-ghost px-3 py-2 text-sm" type="button" disabled={busy || disabled || !selected.length} onClick={() => { setSelected([]); setDeleteConfirm(false); }}>Clear selection</button>
      </div>
      <p className="text-sm">Use up to 1 GB of saved photos in one listing batch. Saved photos do not need to be uploaded again.</p>
      {selectedSize > bulkListingMaxWorkspaceSizeBytes ? <p className="notice notice-info text-sm">These photos total {formatPhotoSize(selectedSize)}. Each listing batch can use up to 1 GB. Uncheck some photos to create a smaller batch; the rest stay saved in your inbox for the next batch.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button className="button-primary px-3 py-2 text-sm" type="button" disabled={busy || disabled || !selected.length} onClick={() => void run(useSelected)}>Use selected photos in this batch</button>
        <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busy || disabled || !selected.length} onClick={() => setDeleteConfirm(true)}>Remove selected from inbox</button>
      </div>
      {deleteConfirm ? <div className="notice notice-danger"><p>Remove {selected.length} saved photos from your inbox? Published listing photos and photos already added to this workspace will remain.</p>
        <button className="button-secondary px-3 py-2" type="button" disabled={busy || disabled} onClick={() => void run(async () => {
          for (const id of selected) { const response = await fetch(`/api/admin/photos/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Some photos could not be removed. Refresh to see what remains."); }
          setSelected([]); setDeleteConfirm(false); await load(); setMessage("Selected inbox photos removed.");
        })}>Confirm removal</button>{" "}<button type="button" className="button-ghost px-3 py-2" onClick={() => setDeleteConfirm(false)}>Cancel</button></div> : null}
      {!photos.length ? <p className="text-sm">Your inbox is empty. Upload photos above to save them for later.</p> : <div className="grid max-h-[36rem] grid-cols-2 gap-3 overflow-auto md:grid-cols-4">
        {sortedPhotos.map((photo) => <div key={photo.id} className="space-y-2 rounded-lg border border-zinc-200 p-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select saved photo ${photo.fileName}`} disabled={busy || disabled} checked={selected.includes(photo.id)}
            onChange={(event) => { setSelected(event.target.checked ? [...selected, photo.id] : selected.filter((id) => id !== photo.id)); setDeleteConfirm(false); }} />Select</label>
          <PhotoThumbnails images={[{ id: photo.id, filename: photo.fileName, src: `/api/admin/photos/${photo.id}` }]} />
          <p className="break-words text-xs">{photoDateLabel(photo)}</p>
        </div>)}
      </div>}
    </> : null}
  </section>;
}
