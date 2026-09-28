"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { resumableWorkspace, serializableWorkspace, type BulkWorkspaceSnapshot, type BulkWorkspaceSummary, type SavedBulkWorkspace } from "@/lib/catalog/bulk-workspace-draft";
import { deleteWorkspaceRecovery, listWorkspaceRecoveries, readWorkspaceRecovery, saveWorkspaceRecovery, type WorkspaceRecovery } from "@/lib/catalog/bulk-workspace-recovery";

const endpoint = "/api/admin/listings/workspaces";
async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || response.redirected) throw new Error(body.message || "Could not save to your account. Check your connection and sign-in, then retry.");
  return body;
}
const newId = () => `batch-${crypto.randomUUID()}`;
const keyFor = (name: string, snapshot: BulkWorkspaceSnapshot) => JSON.stringify({ name, snapshot: serializableWorkspace(snapshot) });

export function useBulkWorkspaceProgress(input: {
  ownerId: string; snapshot: BulkWorkspaceSnapshot; completed: boolean; paused: boolean;
  onRestore: (workspace: SavedBulkWorkspace) => void;
}) {
  const [name, setName] = useState("Untitled batch");
  const [message, setMessage] = useState("Checking saved batches…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<BulkWorkspaceSummary[]>([]);
  const [recoveries, setRecoveries] = useState<WorkspaceRecovery[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activeRecoveryKey, setActiveRecoveryKey] = useState("");
  const current = useRef({ id: "", version: 0, recoveryKey: "", persistedKey: "", observedKey: "", dirty: false });
  const latest = useRef({ name, snapshot: input.snapshot });
  const running = useRef<Promise<SavedBulkWorkspace | null> | null>(null);
  const localQueue = useRef<Promise<unknown>>(Promise.resolve());
  const onRestore = useRef(input.onRestore);
  const suppress = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const { workspaces } = await requestJson<{ workspaces: BulkWorkspaceSummary[] }>(endpoint);
    setSaved(workspaces);
  }, []);
  useEffect(() => { onRestore.current = input.onRestore; }, [input.onRestore]);
  useEffect(() => {
    mounted.current = true;
    const id = newId(); current.current = { id, version: 0, recoveryKey: `${input.ownerId}:${crypto.randomUUID()}`, persistedKey: "", observedKey: "", dirty: false };
    void Promise.allSettled([requestJson<{ workspaces: BulkWorkspaceSummary[] }>(endpoint), listWorkspaceRecoveries(input.ownerId)]).then((results) => {
      if (!mounted.current) return;
      setActiveId(id);
      setActiveRecoveryKey(current.current.recoveryKey);
      if (results[0].status === "fulfilled") setSaved(results[0].value.workspaces);
      if (results[1].status === "fulfilled") setRecoveries(results[1].value);
      setReady(true);
      setMessage(results[0].status === "rejected" ? "Account saves are unavailable. Keep this tab open; retry Save progress when connected." : "Changes save automatically. You can also use Save progress at any time.");
    });
    return () => { mounted.current = false; };
  }, [input.ownerId, refresh]);

  const backup = useCallback((snapshot: BulkWorkspaceSnapshot, nextName: string, listingIds: string[] = []) => {
    const meta = { ...current.current };
    const record: WorkspaceRecovery = { id: meta.id, version: meta.version, recoveryKey: meta.recoveryKey, ownerId: input.ownerId, name: nextName, snapshot, listingIds, updatedAtUtc: new Date().toISOString() };
    localQueue.current = localQueue.current.catch(() => {}).then(() => saveWorkspaceRecovery(record));
    return localQueue.current;
  }, [input.ownerId]);

  const save = useCallback(async (): Promise<SavedBulkWorkspace | null> => {
    if (running.current) return running.current;
    if (!current.current.id) return null;
    const work = async () => {
      setBusy(true); setMessage("Saving progress… Keep this tab open until saved.");
      try {
        // Recheck the latest text after uploading attachments so edits made during an upload survive.
        let savedWorkspace: SavedBulkWorkspace | null = null;
        const uploaded = new Map<string, string>();
        for (;;) {
          const { name: nextName, snapshot: source } = latest.current;
          const snapshot = { ...source, media: source.media.map((entry) => ({ ...entry, ...(uploaded.has(entry.id) ? { savedAssetId: uploaded.get(entry.id)! } : {}) })) };
          const localBackup = backup(snapshot, nextName).catch(() => { /* Account save can still succeed when device storage is full. */ });
          const put = async (state: BulkWorkspaceSnapshot) => {
            const result = await requestJson<{ workspace: SavedBulkWorkspace }>(`${endpoint}/${current.current.id}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version: current.current.version, name: nextName, snapshot: serializableWorkspace(state) })
            });
            current.current.version = result.workspace.version;
            return result.workspace;
          };
          if (!current.current.version) { await put(snapshot); await backup(snapshot, nextName).catch(() => {}); }
          for (const entry of snapshot.media) {
            if (entry.savedPhotoId || entry.savedAssetId) continue;
            if (!(entry.file instanceof File)) throw new Error(`Select “${entry.file.name}” again to finish saving its attachment. Your item details are retained.`);
            setMessage(`Saving attachment: ${entry.file.name}. Keep this tab open…`);
            const form = new FormData(); form.set("id", entry.id); form.set("file", entry.file, entry.file.name);
            const result = await requestJson<{ asset: { id: string } }>(`${endpoint}/${current.current.id}/media`, { method: "POST", body: form });
            entry.savedAssetId = result.asset.id; uploaded.set(entry.id, result.asset.id);
          }
          savedWorkspace = await put(snapshot);
          await localBackup;
          await backup(snapshot, nextName).catch(() => {});
          const sourceKey = keyFor(nextName, source);
          if (keyFor(latest.current.name, latest.current.snapshot) !== sourceKey) continue;
          // Keep File objects for previews; saved IDs make later requests metadata-only.
          latest.current = { name: nextName, snapshot };
          current.current.persistedKey = keyFor(nextName, snapshot);
          current.current.observedKey = current.current.persistedKey;
          current.current.dirty = false;
          suppress.current = true;
          onRestore.current({ ...savedWorkspace, snapshot });
          setSaved((rows) => [savedWorkspace!, ...rows.filter((row) => row.id !== savedWorkspace!.id)]);
          setMessage(`Saved to your account at ${new Date(savedWorkspace.updatedAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Safe to leave and resume on another device.`);
          return savedWorkspace;
        }
      } catch (error) {
        current.current.dirty = true;
        setMessage(error instanceof Error ? error.message : "Could not save. Keep this tab open and retry Save progress.");
        return null;
      } finally { running.current = null; setBusy(false); }
    };
    running.current = work();
    return running.current;
  }, [backup]);

  useEffect(() => {
    latest.current = { name, snapshot: input.snapshot };
    const key = keyFor(name, input.snapshot);
    if (!current.current.observedKey || suppress.current) { current.current.observedKey = key; suppress.current = false; return; }
    const changed = key !== current.current.observedKey;
    current.current.observedKey = key;
    if (changed) current.current.dirty = key !== current.current.persistedKey;
    if (!ready || input.completed) return;
    if (!current.current.dirty) return;
    setMessage("Unsaved changes — saving automatically…");
    if (changed) void backup(input.snapshot, name).catch(() => setMessage("Device recovery storage is unavailable. Keep this tab open until your account save finishes."));
    if (input.paused) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [name, input.snapshot, input.completed, input.paused, ready, backup, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current.dirty || running.current) { event.preventDefault(); event.returnValue = ""; } };
    const retry = () => { if (current.current.dirty && !input.completed && !input.paused) void save(); };
    window.addEventListener("beforeunload", warn); window.addEventListener("online", retry);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("online", retry); };
  }, [save, input.completed, input.paused]);

  const resume = async (id: string, recovery?: WorkspaceRecovery) => {
    if (busy || input.paused) return;
    if (current.current.dirty && !await save()) {
      // A stale tab cannot save over a newer version. Preserve its copy and let
      // the user inspect another version instead of trapping them in retries.
      try { await backup(latest.current.snapshot, latest.current.name); }
      catch { setMessage("Could not keep a recovery copy on this device. Copy your unfinished text before leaving this batch."); return; }
      if (!window.confirm("Your unfinished edits are kept in a recovery copy on this device. Open the selected saved version?")) return;
      setRecoveries(await listWorkspaceRecoveries(input.ownerId).catch(() => []));
    }
    try {
      let workspace: SavedBulkWorkspace;
      let newerAccountVersion = false;
      if (recovery) {
        workspace = await readWorkspaceRecovery(recovery);
        const server = await requestJson<{ workspace: SavedBulkWorkspace }>(`${endpoint}/${id}`).catch(() => null);
        if (server?.workspace.listingIds.length) workspace = server.workspace;
        else if (server && server.workspace.version !== workspace.version) {
          if (keyFor(server.workspace.name, server.workspace.snapshot) === keyFor(workspace.name, workspace.snapshot)) workspace = { ...workspace, version: server.workspace.version };
          else newerAccountVersion = true;
        }
      } else workspace = (await requestJson<{ workspace: SavedBulkWorkspace }>(`${endpoint}/${id}`)).workspace;
      workspace = { ...workspace, snapshot: resumableWorkspace(workspace.snapshot) };
      current.current = { id, version: workspace.version, recoveryKey: recovery?.recoveryKey ?? `${input.ownerId}:${crypto.randomUUID()}`, persistedKey: recovery ? "" : keyFor(workspace.name, workspace.snapshot), observedKey: "", dirty: Boolean(recovery) };
      suppress.current = true; latest.current = { name: workspace.name, snapshot: workspace.snapshot };
      setName(workspace.name); setActiveId(id); onRestore.current(workspace);
      setActiveRecoveryKey(current.current.recoveryKey);
      if (!recovery) setSaved((rows) => [workspace, ...rows.filter((row) => row.id !== workspace.id)]);
      setMessage(workspace.listingIds.length ? "This batch already created listings. Open them below; it cannot be submitted twice."
        : newerAccountVersion ? "Device recovery opened. A newer account version exists, so this copy cannot overwrite it. Copy any text you need, then use Resume batch to open the account version."
        : "Batch restored. Continue editing wherever you left off.");
      if (recovery && !workspace.listingIds.length && !newerAccountVersion) setTimeout(() => void save(), 0);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not resume this batch."); }
  };
  const startNew = () => {
    const id = newId(); current.current = { id, version: 0, recoveryKey: `${input.ownerId}:${crypto.randomUUID()}`, persistedKey: "", observedKey: "", dirty: false };
    suppress.current = true; setName("Untitled batch"); setActiveId(id); setMessage("New batch. Your previous saved batches are listed below.");
    setActiveRecoveryKey(current.current.recoveryKey);
  };
  const markCompleted = async (listingIds: string[]) => {
    current.current.dirty = false;
    await backup(latest.current.snapshot, latest.current.name, listingIds).catch(() => {});
    setMessage("Batch completed. Your listings are saved.");
    await refresh().catch(() => {});
  };
  const remove = async (row: BulkWorkspaceSummary) => {
    if (!window.confirm(`Delete saved batch “${row.name}”? This removes its unfinished workspace. Existing listings and inbox photos stay available.`)) return;
    try {
      await requestJson(`${endpoint}/${row.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: row.version }) });
      setSaved((rows) => rows.filter((candidate) => candidate.id !== row.id));
      const local = await listWorkspaceRecoveries(input.ownerId);
      for (const record of local.filter((record) => record.id === row.id)) await deleteWorkspaceRecovery(record.recoveryKey);
      setRecoveries((rows) => rows.filter((record) => record.id !== row.id));
      setMessage("Saved batch deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete saved batch."); }
  };
  return { name, setName, message, busy, ready, saved, recoveries, activeId, activeRecoveryKey, save, resume, startNew, markCompleted, remove, refresh };
}
