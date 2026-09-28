import { bulkListingMaxItems, type BulkListingItemInput } from "./bulk-listings";
import { descriptionPhotoMaxCount } from "./description-photos";
import { prepareDescriptionPhotos } from "./prepare-description-photos";
import type { DescriptionDraftInput } from "./description-draft-input";
import { isPriceSuggestion, type PriceSuggestion } from "./price-suggestion";

export type BulkDescriptionDraft = {
  sourceKey: string;
  status: "queued" | "generating" | "ready" | "error" | "stopped" | "applied" | "discarded";
  title?: string;
  description?: string;
  conditionNote?: string;
  descriptionOnly?: boolean;
  priceSuggestion?: PriceSuggestion | null;
  priceApplied?: boolean;
  pricingListingType?: DescriptionDraftInput["listingType"];
  message: string;
};

export type BulkDescriptionJob = {
  clientId: string;
  sourceKey: string;
  files: File[];
  loadFiles?: (signal: AbortSignal) => Promise<File[]>;
  input: Omit<DescriptionDraftInput, "images">;
};

export function getBulkDescriptionPhotoIds(item: BulkListingItemInput, firstImageOnly = false) {
  const orderedIds = [...new Set([...(item.imageOrder ?? []), ...item.imageFileIds])]
    .filter((id) => item.imageFileIds.includes(id));
  const primaryId = item.primaryImageFileId;
  const photos = (primaryId && orderedIds.includes(primaryId)
    ? [primaryId, ...orderedIds.filter((id) => id !== primaryId)]
    : orderedIds).slice(0, descriptionPhotoMaxCount);
  return firstImageOnly ? photos.slice(0, 1) : photos;
}

// A preview only belongs to the exact item facts and photo assignments that produced it.
export function getBulkDescriptionSourceKey(item: BulkListingItemInput, options: { saleContext?: string; firstImageOnly?: boolean } = {}) {
  return JSON.stringify([
    item.clientId, item.title, item.categorySlug, item.condition ?? "", item.description,
    item.imageFileIds, item.imageOrder ?? [], item.primaryImageFileId ?? null,
    item.listingType, item.priceCents ?? "", item.startingBidCents ?? "",
    options.saleContext ?? "", options.firstImageOnly ?? false
  ]);
}

export function canApplyBulkDescriptionDraft(item: BulkListingItemInput, draft?: BulkDescriptionDraft, options: { saleContext?: string; firstImageOnly?: boolean } = {}) {
  return draft?.status === "ready" && typeof draft.title === "string" &&
    draft.title.trim().length >= 3 && draft.title.length <= 200 &&
    typeof draft.description === "string" && Boolean(draft.description.trim()) &&
    draft.description.length <= 3000 &&
    typeof draft.conditionNote === "string" && draft.conditionNote.length <= 2000 &&
    draft.sourceKey === getBulkDescriptionSourceKey(item, options);
}

export function getBulkDescriptionDraftChanges(item: BulkListingItemInput, draft?: BulkDescriptionDraft, options: { saleContext?: string; firstImageOnly?: boolean } = {}) {
  if (!canApplyBulkDescriptionDraft(item, draft, options)) {
    return null;
  }
  return draft!.descriptionOnly ? { description: draft!.description! }
    : { title: draft!.title!, description: draft!.description!, condition: draft!.conditionNote! };
}

export function getBulkPriceSuggestionChanges(item: BulkListingItemInput, draft?: BulkDescriptionDraft, options: { saleContext?: string; firstImageOnly?: boolean } = {}) {
  if (!draft || draft.descriptionOnly || !["ready", "applied"].includes(draft.status) || draft.priceApplied ||
    draft.sourceKey !== getBulkDescriptionSourceKey(item, options) || !isPriceSuggestion(draft.priceSuggestion, item.listingType)) return null;
  const amount = String(draft.priceSuggestion.suggestedPriceCents);
  return item.listingType === "auction" ? { startingBidCents: amount } : { priceCents: amount };
}

export function selectBulkDescriptionItems(
  items: BulkListingItemInput[],
  drafts: Record<string, BulkDescriptionDraft>,
  options: { saleContext?: string; firstImageOnly?: boolean } = {}
) {
  return items.filter((item) => {
    if (item.description.trim() || getBulkDescriptionPhotoIds(item).length === 0) {
      return false;
    }
    const draft = drafts[item.clientId];
    if (!draft) return true;
    if (draft.status === "discarded") return false;
    if (["ready", "applied"].includes(draft.status)) {
      return draft.sourceKey !== getBulkDescriptionSourceKey(item, options);
    }
    return ["error", "stopped"].includes(draft.status);
  }).slice(0, bulkListingMaxItems);
}

class BulkDescriptionRequestError extends Error {
  constructor(message: string, readonly stopQueue: boolean) {
    super(message);
  }
}

async function requestDescription(
  job: BulkDescriptionJob,
  signal: AbortSignal,
  prepare: typeof prepareDescriptionPhotos,
  fetchImpl: typeof fetch
) {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const files = job.loadFiles ? await job.loadFiles(requestSignal) : job.files;
  const images = files.length ? await prepare(files, requestSignal) : undefined;
  requestSignal.throwIfAborted();
  const response = await fetchImpl("/api/admin/listings/description-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...job.input, images }),
    signal: requestSignal
  });
  if (response.redirected || response.status === 401 || response.status === 403) {
    throw new BulkDescriptionRequestError("Please sign in as an administrator again before continuing AI drafting.", true);
  }
  const payload = await response.json().catch(() => null) as {
    title?: unknown; description?: unknown; conditionNote?: unknown; message?: unknown; status?: unknown; priceSuggestion?: unknown;
  } | null;
  const stopQueue = response.status === 429 || payload?.status === "description_ai_disabled";
  if (!response.ok || payload?.status !== "description_draft_ready" ||
    typeof payload.title !== "string" || payload.title.trim().length < 3 || payload.title.length > 200 ||
    typeof payload.description !== "string" || !payload.description.trim() || payload.description.length > 3000 ||
    typeof payload.conditionNote !== "string" || payload.conditionNote.length > 2000) {
    throw new BulkDescriptionRequestError(
      typeof payload?.message === "string" ? payload.message : "AI drafting could not finish for this item. Try it again when ready.",
      stopQueue
    );
  }
  if (job.input.includePriceSuggestion && payload.priceSuggestion != null && !isPriceSuggestion(payload.priceSuggestion, job.input.listingType)) {
    throw new BulkDescriptionRequestError("AI returned an invalid price suggestion. This item's fields have not changed.", false);
  }
  requestSignal.throwIfAborted();
  return { title: payload.title.trim(), description: payload.description.trim(), conditionNote: payload.conditionNote.trim(),
    descriptionOnly: Boolean(job.input.revisionInstructions),
    ...(job.input.includePriceSuggestion ? { priceSuggestion: payload.priceSuggestion as PriceSuggestion | null ?? null, pricingListingType: job.input.listingType } : {}) };
}

export async function runBulkDescriptionQueue({
  jobs, signal, onUpdate, onProgress,
  prepare = prepareDescriptionPhotos, fetchImpl = fetch
}: {
  jobs: readonly BulkDescriptionJob[];
  signal: AbortSignal;
  onUpdate: (clientId: string, draft: BulkDescriptionDraft) => void;
  onProgress: (completed: number) => void;
  prepare?: typeof prepareDescriptionPhotos;
  fetchImpl?: typeof fetch;
}) {
  let completed = 0;
  let failed = 0;
  let stopMessage = "";
  for (const job of jobs) {
    if (signal.aborted || stopMessage) {
      break;
    }
    onUpdate(job.clientId, { sourceKey: job.sourceKey, status: "generating", message: "Analyzing this item's photos…" });
    try {
      const draft = await requestDescription(job, signal, prepare, fetchImpl);
      signal.throwIfAborted();
      onUpdate(job.clientId, { sourceKey: job.sourceKey, status: "ready", ...draft, message: draft.descriptionOnly ? "Revised description ready. Review it before applying." : "Title, description and estimated condition ready. Review before applying." });
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      failed += 1;
      const message = error instanceof Error && error.name !== "TimeoutError"
        ? error.message : "AI drafting timed out for this item. You can try this row again.";
      onUpdate(job.clientId, { sourceKey: job.sourceKey, status: "error", message });
      if (error instanceof BulkDescriptionRequestError && error.stopQueue) {
        stopMessage = message;
      }
    }
    completed += 1;
    onProgress(completed);
  }
  for (const job of jobs.slice(completed)) {
    onUpdate(job.clientId, { sourceKey: job.sourceKey, status: "stopped", message: "Not completed. Start again when ready." });
  }
  return { completed, failed, stopped: signal.aborted || Boolean(stopMessage), stopMessage };
}
