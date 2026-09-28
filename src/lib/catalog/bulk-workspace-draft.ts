import { bulkListingMaxItems, bulkListingMaxWorkspaceSizeBytes, type BulkListingItemInput } from "./bulk-listings";
import type { BulkWorkspaceMedia } from "./bulk-workspace-media";
import type { BulkDescriptionDraft } from "./bulk-description-drafts";
import type { AuctionDurationUnit } from "./bulk-auction-schedule";
import { isPriceSuggestion } from "./price-suggestion";
import { descriptionSaleContextMaxCharacters } from "./description-draft-input";

export type BulkWorkspaceSnapshot = {
  items: BulkListingItemInput[];
  media: BulkWorkspaceMedia[];
  sharedClosing: boolean;
  sharedEndAtUtc: string;
  duration: string;
  durationUnit: AuctionDurationUnit;
  editingInstructions: Record<string, string>;
  descriptionDrafts: Record<string, BulkDescriptionDraft>;
  includePriceSuggestion: boolean;
  aiSaleContext?: string;
  firstImageOnly?: boolean;
  descriptionSelectionOverrides?: Record<string, boolean>;
  defaultCategorySlug?: string;
  saveAs: "draft" | "published";
};
export type SavedBulkWorkspace = {
  id: string; name: string; version: number; updatedAtUtc: string;
  listingIds: string[]; snapshot: BulkWorkspaceSnapshot;
};
export type BulkWorkspaceSummary = Omit<SavedBulkWorkspace, "snapshot">;
export const workspaceSnapshotMaxBytes = 2 * 1024 * 1024;

export class WorkspaceDraftError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, max = 20000): value is string => typeof value === "string" && value.length <= max;
const ids = (value: unknown, max = 900): value is string[] => Array.isArray(value) && value.length <= max && value.every((id) => string(id, 150));
export function parseWorkspaceSnapshot(value: unknown): BulkWorkspaceSnapshot {
  const invalid = () => { throw new WorkspaceDraftError("This saved batch could not be read. Keep this tab open and retry saving."); };
  if (!record(value) || !Array.isArray(value.items) || value.items.length > bulkListingMaxItems || !Array.isArray(value.media) || value.media.length > 900) return invalid();
  for (const item of value.items) {
    if (!record(item) || !["clientId", "title", "description", "categorySlug", "sku"].every((key) => string(item[key])) || !["auction", "fixed_price"].includes(String(item.listingType)) ||
      !ids(item.imageFileIds) || !ids(item.videoFileIds) || (item.imageOrder !== undefined && !ids(item.imageOrder)) ||
      !["condition", "endAtUtc", "mediaPrefix", "priceCents", "startingBidCents", "bidIncrementCents", "quantity", "status", "primaryImageFileId"].every((key) => item[key] == null || string(item[key]))) return invalid();
  }
  const media = value.media.map((entry) => {
    if (!record(entry) || !string(entry.id, 150) || !record(entry.file) || !string(entry.file.name, 255) || !string(entry.file.type, 100) ||
      !Number.isSafeInteger(entry.file.size) || Number(entry.file.size) < 0 || !Number.isFinite(entry.file.lastModified) ||
      (entry.savedPhotoId !== undefined && !string(entry.savedPhotoId, 100)) || (entry.savedAssetId !== undefined && !string(entry.savedAssetId, 100)) || (entry.savedPhotoId && entry.savedAssetId)) return invalid();
    return { id: entry.id, file: { name: entry.file.name, size: entry.file.size, type: entry.file.type, lastModified: entry.file.lastModified },
      ...(entry.savedPhotoId ? { savedPhotoId: entry.savedPhotoId } : {}), ...(entry.savedAssetId ? { savedAssetId: entry.savedAssetId } : {}) } as BulkWorkspaceMedia;
  });
  if (new Set(media.map((entry) => entry.id)).size !== media.length || new Set(value.items.map((item) => item.clientId)).size !== value.items.length ||
    media.reduce((sum, entry) => sum + entry.file.size, 0) > bulkListingMaxWorkspaceSizeBytes) return invalid();
  if (typeof value.sharedClosing !== "boolean" || typeof value.includePriceSuggestion !== "boolean" || !string(value.sharedEndAtUtc, 100) || !string(value.duration, 100) ||
    !["days", "hours", "minutes"].includes(String(value.durationUnit)) || !["draft", "published"].includes(String(value.saveAs)) ||
    !record(value.editingInstructions) || !Object.values(value.editingInstructions).every((v) => string(v)) || !record(value.descriptionDrafts) ||
    (value.aiSaleContext !== undefined && !string(value.aiSaleContext, descriptionSaleContextMaxCharacters)) ||
    (value.firstImageOnly !== undefined && typeof value.firstImageOnly !== "boolean") ||
    (value.defaultCategorySlug !== undefined && !string(value.defaultCategorySlug, 120)) ||
    (value.descriptionSelectionOverrides !== undefined && (!record(value.descriptionSelectionOverrides) || !Object.values(value.descriptionSelectionOverrides).every((v) => typeof v === "boolean")))) return invalid();
  const drafts: Record<string, BulkDescriptionDraft> = {};
  for (const [id, draft] of Object.entries(value.descriptionDrafts)) {
    if (!record(draft) || !string(draft.sourceKey, 100000) || !string(draft.message) || !["queued", "generating", "ready", "error", "stopped", "applied", "discarded"].includes(String(draft.status)) ||
      !["title", "description", "conditionNote"].every((key) => draft[key] === undefined || string(draft[key])) ||
      !["descriptionOnly", "priceApplied"].every((key) => draft[key] === undefined || typeof draft[key] === "boolean") ||
      (draft.priceSuggestion != null && !isPriceSuggestion(draft.priceSuggestion, draft.pricingListingType === "fixed_price" ? "fixed_price" : "auction"))) return invalid();
    drafts[id] = draft as BulkDescriptionDraft;
  }
  return { ...(value as BulkWorkspaceSnapshot), media, descriptionDrafts: drafts };
}

/** File bytes are stored separately; never rely on JSON.stringify(File). */
export function serializableWorkspace(snapshot: BulkWorkspaceSnapshot): BulkWorkspaceSnapshot {
  return { ...snapshot, media: snapshot.media.map((entry) => ({ ...entry, file: {
    name: entry.file.name, size: entry.file.size, type: entry.file.type, lastModified: entry.file.lastModified
  } })) };
}

export function resumableWorkspace(snapshot: BulkWorkspaceSnapshot): BulkWorkspaceSnapshot {
  return { ...snapshot, descriptionDrafts: Object.fromEntries(Object.entries(snapshot.descriptionDrafts).map(([id, draft]) => [id,
    ["queued", "generating"].includes(draft.status) ? { ...draft, status: "stopped", message: "Interrupted when you left. Start this AI preview again when ready." } : draft
  ])) };
}
