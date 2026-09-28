import { serializableWorkspace, type SavedBulkWorkspace } from "./bulk-workspace-draft";

export type WorkspaceRecovery = SavedBulkWorkspace & { recoveryKey: string; ownerId: string };
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("layu-bulk-progress", 1);
  request.onupgradeneeded = () => { request.result.createObjectStore("workspaces", { keyPath: "recoveryKey" }); request.result.createObjectStore("files"); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });

export async function listWorkspaceRecoveries(ownerId: string) {
  const db = await database();
  try { const records = await result(db.transaction("workspaces").objectStore("workspaces").getAll()) as WorkspaceRecovery[];
    return records.filter((record) => record.ownerId === ownerId).sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
  } finally { db.close(); }
}

export async function saveWorkspaceRecovery(record: WorkspaceRecovery) {
  const db = await database();
  try {
    // Store a File only once. Typing in 100 descriptions must not rewrite 580 MB.
    const tx = db.transaction(["workspaces", "files"], "readwrite");
    const done = complete(tx), files = tx.objectStore("files");
    for (const entry of record.snapshot.media) {
      if (!(entry.file instanceof File) || entry.savedPhotoId || entry.savedAssetId) continue;
      const key = `${record.recoveryKey}:${entry.id}`;
      const request = files.getKey(key);
      request.onsuccess = () => { if (request.result === undefined) files.put(entry.file, key); };
    }
    tx.objectStore("workspaces").put({ ...record, snapshot: serializableWorkspace(record.snapshot) });
    await done;
  } finally { db.close(); }
}

export async function readWorkspaceRecovery(record: WorkspaceRecovery) {
  const db = await database();
  try {
    const tx = db.transaction("files");
    const media = await Promise.all(record.snapshot.media.map(async (entry) => {
      if (entry.savedPhotoId || entry.savedAssetId) return entry;
      const file = await result(tx.objectStore("files").get(`${record.recoveryKey}:${entry.id}`));
      return file instanceof File ? { ...entry, file } : entry;
    }));
    return { ...record, snapshot: { ...record.snapshot, media } };
  } finally { db.close(); }
}

export async function deleteWorkspaceRecovery(key: string) {
  const db = await database();
  try {
    const tx = db.transaction(["workspaces", "files"], "readwrite"), done = complete(tx);
    tx.objectStore("workspaces").delete(key);
    tx.objectStore("files").delete(IDBKeyRange.bound(`${key}:`, `${key}:\uffff`));
    await done;
  } finally { db.close(); }
}
