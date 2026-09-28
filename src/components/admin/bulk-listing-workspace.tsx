"use client";

import type { Category } from "@prisma/client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ListingBatchControls } from "@/components/admin/listing-batch-controls";
import { MoneyInput } from "@/components/admin/money-input";
import { QuickCategoryDialog, type QuickCategory } from "@/components/admin/quick-category-dialog";
import { defaultVerificationPolicy, describeVerificationPolicy, type VerificationPolicy } from "@/lib/verification/policy";
import { PhotoInbox } from "@/components/admin/photo-inbox";
import { useBulkWorkspaceProgress } from "@/components/admin/use-bulk-workspace-progress";
import type { BulkWorkspaceSnapshot, SavedBulkWorkspace } from "@/lib/catalog/bulk-workspace-draft";
import { PhotoThumbnails } from "@/components/admin/photo-thumbnails";
import { PriceSuggestionPreview } from "@/components/admin/price-suggestion-preview";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  bulkListingImageAcceptedExtensions,
  bulkListingMaxItems,
  bulkListingMaxWorkspaceSizeBytes,
  bulkListingVideoAcceptedExtensions,
  bulkListingVideoMaxCount,
  appendBulkListingMedia,
  type BulkListingItemInput,
  type BulkListingMediaInput,
  type BulkListingValidationIssue,
  getBulkListingMediaKind,
  matchBulkListingMedia,
  parseBulkListingCsv,
  validateBulkListingWorkspace
} from "@/lib/catalog/bulk-listings";
import {
  canApplyBulkDescriptionDraft,
  getBulkDescriptionDraftChanges,
  getBulkDescriptionPhotoIds,
  getBulkDescriptionSourceKey,
  getBulkPriceSuggestionChanges,
  runBulkDescriptionQueue,
  selectBulkDescriptionItems,
  type BulkDescriptionDraft,
  type BulkDescriptionJob
} from "@/lib/catalog/bulk-description-drafts";
import { descriptionPhotoMaxCount } from "@/lib/catalog/description-photos";
import { defaultListingSaleContext, descriptionSaleContextMaxCharacters } from "@/lib/catalog/description-draft-input";
import { savedPhotoMedia, savedMediaPreviews, savedMediaUrl, localMediaFiles, loadBulkDescriptionFiles, type BulkWorkspaceMedia } from "@/lib/catalog/bulk-workspace-media";
import type { SavedInboxPhoto } from "@/lib/catalog/upload-inbox-photo";
import { formatBidTierLabel } from "@/lib/catalog/presentation";
import { applySharedAuctionEnd, auctionEndAfter, auctionEndToLocalInput, localAuctionEndToUtc, type AuctionDurationUnit } from "@/lib/catalog/bulk-auction-schedule";

type BulkListingWorkspaceProps = {
  ownerId?: string;
  verificationPolicy?: VerificationPolicy;
  aiEnabled?: boolean;
  categories: Pick<Category, "id" | "name" | "slug" | "requiredBidTier">[];
};

type MediaEntry = BulkWorkspaceMedia;

function AssignedVideoPreview({ entry }: { entry: MediaEntry }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const savedUrl = savedMediaUrl(entry);
    const objectUrl = !savedUrl && entry.file instanceof File ? URL.createObjectURL(entry.file) : null;
    const src = savedUrl ?? objectUrl;
    if (src) video.src = src;
    return () => {
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry]);

  return <video aria-label={`Preview of ${entry.file.name}`} className="aspect-video w-full rounded-md border border-zinc-200 bg-black object-contain" controls preload="metadata" ref={videoRef} />;
}

const acceptedMediaValue = [
  ...bulkListingImageAcceptedExtensions,
  ...bulkListingVideoAcceptedExtensions
].join(",");

const subscribeToClientReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function createClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankItem(categories: BulkListingWorkspaceProps["categories"], defaultCategorySlug?: string): BulkListingItemInput {
  return {
    bidIncrementCents: "",
    categorySlug: defaultCategorySlug && categories.some((category) => category.slug === defaultCategorySlug)
      ? defaultCategorySlug : categories[0]?.slug ?? "",
    clientId: createClientId("item"),
    condition: "",
    description: "",
    endAtUtc: "",
    imageFileIds: [],
    imageOrder: [],
    listingType: "auction",
    mediaPrefix: "",
    priceCents: "",
    primaryImageFileId: null,
    quantity: "",
    sku: "",
    startingBidCents: "",
    status: "draft",
    title: "",
    videoFileIds: []
  };
}

export function duplicateItem(item: BulkListingItemInput): BulkListingItemInput {
  return {
    ...item,
    clientId: createClientId("item"),
    imageFileIds: [],
    imageOrder: [],
    primaryImageFileId: null,
    sku: "",
    title: item.title ? `${item.title} copy` : "",
    videoFileIds: []
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toMediaInputs(media: MediaEntry[]): BulkListingMediaInput[] {
  return media.map(({ file, id, savedPhotoId, savedAssetId }) => ({
    id,
    ...(savedPhotoId ? { savedPhotoId } : {}),
    ...(savedAssetId ? { savedAssetId } : {}),
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type
  }));
}

function removeFileId(item: BulkListingItemInput, fileId: string): BulkListingItemInput {
  const imageFileIds = item.imageFileIds.filter((id) => id !== fileId);
  const videoFileIds = item.videoFileIds.filter((id) => id !== fileId);
  const primaryImageFileId =
    item.primaryImageFileId === fileId ? imageFileIds[0] ?? null : item.primaryImageFileId;

  return {
    ...item,
    imageFileIds,
    imageOrder: imageFileIds,
    primaryImageFileId,
    videoFileIds
  };
}

function moveValue(values: string[], value: string, direction: -1 | 1) {
  const currentIndex = values.indexOf(value);

  if (currentIndex < 0) {
    return values;
  }

  const nextIndex = currentIndex + direction;

  if (nextIndex < 0 || nextIndex >= values.length) {
    return values;
  }

  const nextValues = [...values];
  const [removedValue] = nextValues.splice(currentIndex, 1);
  nextValues.splice(nextIndex, 0, removedValue);
  return nextValues;
}

function issueText(issues: BulkListingValidationIssue[]) {
  return issues.map((issue) => issue.message).join(" ");
}

export function BulkListingWorkspace({ categories: initialCategories, aiEnabled = false, ownerId = "", verificationPolicy = defaultVerificationPolicy }: BulkListingWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const assignmentScrollAnchorRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [defaultCategorySlug, setDefaultCategorySlug] = useState(initialCategories[0]?.slug ?? "");
  const [categoryModalTarget, setCategoryModalTarget] = useState<string | "__default__" | null>(null);
  const [aiSaleContext, setAiSaleContext] = useState(defaultListingSaleContext);
  const [firstImageOnly, setFirstImageOnly] = useState(true);
  const [descriptionSelectionOverrides, setDescriptionSelectionOverrides] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<BulkListingItemInput[]>(() => [createBlankItem(categories)]);
  useLayoutEffect(() => {
    const anchor = assignmentScrollAnchorRef.current;
    assignmentScrollAnchorRef.current = null;
    if (!anchor?.element.isConnected) return;
    // Item forms grow above the media list. Keep the clicked control in the same
    // place, accounting for any scroll anchoring the browser already performed.
    const displacement = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(displacement) > 0.5) {
      window.scrollBy({ top: displacement, left: 0, behavior: "instant" });
    }
  }, [items]);
  const [sharedClosing, setSharedClosing] = useState(true);
  const [sharedEndAtUtc, setSharedEndAtUtc] = useState(() => auctionEndAfter("10", "days") ?? "");
  const [duration, setDuration] = useState("10");
  const [durationUnit, setDurationUnit] = useState<AuctionDurationUnit>("days");
  const isClient = useSyncExternalStore(subscribeToClientReady, clientReady, serverReady);
  const timeZone = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const [editingInstructions, setEditingInstructions] = useState<Record<string, string>>({});
  const scheduledItems = useMemo(() => applySharedAuctionEnd(items, sharedClosing, sharedEndAtUtc), [items, sharedClosing, sharedEndAtUtc]);
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [csvIssues, setCsvIssues] = useState<BulkListingValidationIssue[]>([]);
  const [serverIssues, setServerIssues] = useState<BulkListingValidationIssue[]>([]);
  const [submitFeedback, setSubmitFeedback] = useState<{
    message: string;
    tone: "danger" | "success";
  } | null>(null);
  const [createdListingIds, setCreatedListingIds] = useState<string[]>([]);
  const [createdTitles, setCreatedTitles] = useState<Record<string, string>>({});
  const [createdPublished, setCreatedPublished] = useState(false);
  const batchResultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (createdListingIds.length) batchResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [createdListingIds.length]);
  const [saveAs, setSaveAs] = useState<"draft" | "published">("draft");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, BulkDescriptionDraft>>({});
  const [isDescribing, setIsDescribing] = useState(false);
  const [includePriceSuggestion, setIncludePriceSuggestion] = useState(true);
  const [descriptionProgress, setDescriptionProgress] = useState({ completed: 0, total: 0 });
  const [descriptionMessage, setDescriptionMessage] = useState("");
  const descriptionRunRef = useRef<AbortController | null>(null);
  const progressSnapshot = useMemo<BulkWorkspaceSnapshot>(() => ({ items, media, sharedClosing, sharedEndAtUtc, duration, durationUnit,
    editingInstructions, descriptionDrafts, includePriceSuggestion, aiSaleContext, firstImageOnly, descriptionSelectionOverrides, defaultCategorySlug, saveAs }),
  [items, media, sharedClosing, sharedEndAtUtc, duration, durationUnit, editingInstructions, descriptionDrafts, includePriceSuggestion, aiSaleContext, firstImageOnly, descriptionSelectionOverrides, defaultCategorySlug, saveAs]);
  function restoreProgress(workspace: SavedBulkWorkspace) {
    const snapshot = workspace.snapshot;
    setItems(snapshot.items); setMedia(snapshot.media); setSharedClosing(snapshot.sharedClosing); setSharedEndAtUtc(snapshot.sharedEndAtUtc);
    setDuration(snapshot.duration); setDurationUnit(snapshot.durationUnit); setEditingInstructions(snapshot.editingInstructions);
    setDescriptionDrafts(snapshot.descriptionDrafts); setIncludePriceSuggestion(snapshot.includePriceSuggestion); setSaveAs(snapshot.saveAs);
    setAiSaleContext(snapshot.aiSaleContext ?? defaultListingSaleContext); setFirstImageOnly(snapshot.firstImageOnly ?? true);
    setDescriptionSelectionOverrides(snapshot.descriptionSelectionOverrides ?? {});
    setDefaultCategorySlug(snapshot.defaultCategorySlug ?? categories[0]?.slug ?? "");
    setCreatedListingIds(workspace.listingIds);
    if (workspace.listingIds.length) {
      setCreatedTitles(Object.fromEntries(workspace.listingIds.map((id, index) => [id, snapshot.items[index]?.title || `Item ${index + 1}`])));
      setCreatedPublished(snapshot.saveAs === "published");
    }
  }
  const progress = useBulkWorkspaceProgress({ ownerId, snapshot: progressSnapshot, completed: createdListingIds.length > 0, paused: isSubmitting, onRestore: restoreProgress });

  useEffect(() => () => {
    descriptionRunRef.current?.abort();
    descriptionRunRef.current = null;
  }, []);

  const descriptionSourceOptions = useMemo(() => ({ saleContext: aiSaleContext, firstImageOnly }), [aiSaleContext, firstImageOnly]);
  const describableItems = useMemo(
    () => selectBulkDescriptionItems(items, descriptionDrafts, descriptionSourceOptions),
    [items, descriptionDrafts, descriptionSourceOptions]
  );
  const selectedDescribableItems = useMemo(
    () => describableItems.filter((item) => descriptionSelectionOverrides[item.clientId] !== false),
    [describableItems, descriptionSelectionOverrides]
  );
  const hasPausedDescriptionWork = describableItems.some((item) => ["stopped", "error"].includes(descriptionDrafts[item.clientId]?.status ?? ""));

  async function describePhotos(selectedItem?: BulkListingItemInput, reviseDescription = false) {
    if (!aiEnabled || descriptionRunRef.current || isSubmitting || createdListingIds.length) {
      return;
    }
    const selectedItems = selectedItem ? [selectedItem] : selectedDescribableItems;
    const jobs: BulkDescriptionJob[] = selectedItems.map((item) => ({
      clientId: item.clientId,
      sourceKey: getBulkDescriptionSourceKey(item, descriptionSourceOptions),
      files: [],
      ...(getBulkDescriptionPhotoIds(item, firstImageOnly).length ? { loadFiles: (signal: AbortSignal) => loadBulkDescriptionFiles(getBulkDescriptionPhotoIds(item, firstImageOnly).flatMap((id) => {
        const entry = media.find((candidate) => candidate.id === id);
        return entry ? [entry] : [];
      }), signal) } : {}),
      input: {
        title: item.title,
        category: categories.find((category) => category.slug === item.categorySlug)?.name ?? "",
        conditionNote: item.condition ?? "",
        description: item.description,
        saleContext: aiSaleContext,
        listingType: item.listingType,
        includePriceSuggestion: reviseDescription ? false : includePriceSuggestion,
        ...(reviseDescription ? { revisionInstructions: editingInstructions[item.clientId]?.trim() } : {})
      }
    })).filter((job) => Boolean(job.loadFiles) || Boolean(job.input.revisionInstructions));
    if (jobs.length === 0) {
      setDescriptionMessage(selectedItem ? "Assign a photo to this item first." : "Select at least one eligible item with a photo. Completed previews are kept; stopped and failed items can be selected again.");
      return;
    }

    const controller = new AbortController();
    descriptionRunRef.current = controller;
    setIsDescribing(true);
    setDescriptionMessage("Analyzing selected items one at a time. Completed previews are kept if the run stops.");
    setDescriptionProgress({ completed: 0, total: jobs.length });
    setDescriptionDrafts((current) => {
      const next = { ...current };
      for (const job of jobs) {
        next[job.clientId] = { sourceKey: job.sourceKey, status: "queued", message: "Waiting to analyze photos…" };
      }
      return next;
    });
    const result = await runBulkDescriptionQueue({
      jobs,
      signal: controller.signal,
      onUpdate: (clientId, draft) => {
        if (descriptionRunRef.current === controller && !controller.signal.aborted) {
          setDescriptionDrafts((current) => ({ ...current, [clientId]: draft }));
        }
      },
      onProgress: (completed) => {
        if (descriptionRunRef.current === controller && !controller.signal.aborted) {
          setDescriptionProgress({ completed, total: jobs.length });
        }
      }
    });
    if (descriptionRunRef.current !== controller) {
      return;
    }
    descriptionRunRef.current = null;
    setIsDescribing(false);
    setDescriptionDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [
      id,
      draft.status === "queued" || draft.status === "generating"
        ? { ...draft, status: "stopped", message: "Not completed. Start again when ready." }
        : draft
    ])));
    setDescriptionMessage(result.stopped
      ? `${result.stopMessage || "Photo drafting stopped."} Earlier previews are kept. Review them below.`
      : `${result.completed - result.failed} preview${result.completed - result.failed === 1 ? "" : "s"} ready${result.failed ? `; ${result.failed} item${result.failed === 1 ? " needs" : "s need"} another attempt` : ""}. Review each preview before applying it.`);
  }

  function applyDescriptionDraft(item: BulkListingItemInput, withPrice = false) {
    const draft = descriptionDrafts[item.clientId];
    const textChanges = getBulkDescriptionDraftChanges(item, draft, descriptionSourceOptions);
    const priceChanges = withPrice ? getBulkPriceSuggestionChanges(item, draft, descriptionSourceOptions) : null;
    if (descriptionRunRef.current || !textChanges || (withPrice && !priceChanges)) {
      return;
    }
    const changes = { ...textChanges, ...priceChanges };
    updateItem(item.clientId, changes);
    setDescriptionDrafts((current) => ({ ...current, [item.clientId]: {
      ...draft, status: "applied", title: undefined, description: undefined, conditionNote: undefined,
      priceApplied: withPrice || draft?.priceApplied,
      sourceKey: getBulkDescriptionSourceKey({ ...item, ...changes }, descriptionSourceOptions),
      message: draft?.descriptionOnly ? "Revised description applied. Other fields are unchanged." : "Suggestions applied. Review this row before creating draft listings."
    } }));
  }

  function applyPriceSuggestion(item: BulkListingItemInput) {
    const draft = descriptionDrafts[item.clientId];
    const changes = getBulkPriceSuggestionChanges(item, draft, descriptionSourceOptions);
    if (descriptionRunRef.current || !changes) return;
    updateItem(item.clientId, changes);
    setDescriptionDrafts((current) => ({ ...current, [item.clientId]: { ...draft,
      priceApplied: true, sourceKey: getBulkDescriptionSourceKey({ ...item, ...changes }, descriptionSourceOptions),
      message: "Suggested price applied. Review it before creating draft listings."
    } }));
  }

  const mediaInputs = useMemo(() => toMediaInputs(media), [media]);
  const validation = useMemo(
    () =>
      validateBulkListingWorkspace({
        items: scheduledItems,
        media: mediaInputs
      }),
    [scheduledItems, mediaInputs]
  );
  const totalSelectedBytes = useMemo(
    () => media.reduce((sum, entry) => sum + entry.file.size, 0),
    [media]
  );
  const isOverRequestCap = totalSelectedBytes > bulkListingMaxWorkspaceSizeBytes;
  const allIssues = useMemo(
    () => [...validation.issues, ...serverIssues],
    [validation.issues, serverIssues]
  );
  const blockingIssues = allIssues.filter((issue) => issue.severity === "error");
  const warningIssues = allIssues.filter((issue) => issue.severity === "warning");
  const rowCounts = useMemo(
    () =>
      items.reduce(
        (counts, item) => {
          const itemIssues = allIssues.filter((issue) => issue.itemClientId === item.clientId);
          const hasErrors = itemIssues.some((issue) => issue.severity === "error");
          const hasWarnings = itemIssues.some((issue) => issue.severity === "warning");

          counts.total += 1;

          if (hasErrors) {
            counts.blocked += 1;
          } else if (hasWarnings) {
            counts.warning += 1;
          } else {
            counts.ready += 1;
          }

          return counts;
        },
        {
          blocked: 0,
          ready: 0,
          total: 0,
          warning: 0
        }
      ),
    [allIssues, items]
  );
  const assignedFileIds = useMemo(
    () => new Set(items.flatMap((item) => [...item.imageFileIds, ...item.videoFileIds])),
    [items]
  );
  const mediaAssignmentCounts = useMemo(
    () =>
      media.reduce(
        (counts, entry) => {
          if (assignedFileIds.has(entry.id)) {
            counts.assigned += 1;
          } else {
            counts.unassigned += 1;
          }

          return counts;
        },
        {
          assigned: 0,
          unassigned: 0
        }
      ),
    [assignedFileIds, media]
  );

  function clearSubmissionState() {
    setServerIssues([]);
    setSubmitFeedback(null);
    setCreatedListingIds([]);
  }

  function updateItem(clientId: string, updates: Partial<BulkListingItemInput>) {
    clearSubmissionState();
    setItems((currentItems) =>
      currentItems.map((item) => (item.clientId === clientId ? { ...item, ...updates } : item))
    );
  }

  function handleCategoryCreated(category: QuickCategory) {
    setCategories((current) => current.some((entry) => entry.id === category.id) ? current : [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
    if (categoryModalTarget === "__default__") setDefaultCategorySlug(category.slug);
    else if (categoryModalTarget) updateItem(categoryModalTarget, { categorySlug: category.slug });
    setCategoryModalTarget(null);
  }

  function applyAutoMatch(nextItems = items, nextMedia = media) {
    const matchResult = matchBulkListingMedia(nextItems, toMediaInputs(nextMedia));

    return nextItems.map((item) => {
      const assignment = matchResult.assignments.get(item.clientId);

      if (!assignment) {
        return item;
      }

      return {
        ...item,
        imageFileIds: assignment.imageFileIds,
        imageOrder: assignment.imageFileIds,
        primaryImageFileId: assignment.primaryImageFileId,
        videoFileIds: assignment.videoFileIds.slice(0, bulkListingVideoMaxCount)
      };
    });
  }

  function getAssignedItemId(fileId: string) {
    return (
      items.find((item) => item.imageFileIds.includes(fileId) || item.videoFileIds.includes(fileId))
        ?.clientId ?? ""
    );
  }

  function assignMedia(fileId: string, itemClientId: string, control?: HTMLElement) {
    if (control) {
      assignmentScrollAnchorRef.current = { element: control, top: control.getBoundingClientRect().top };
    }
    clearSubmissionState();
    const selectedMedia = media.find((entry) => entry.id === fileId);
    const kind = selectedMedia
      ? getBulkListingMediaKind({
          name: selectedMedia.file.name,
          type: selectedMedia.file.type
        })
      : null;

    const newItem = itemClientId === "__new_item__" ? createBlankItem(categories, defaultCategorySlug) : null;
    if (newItem && (!kind || items.length >= bulkListingMaxItems)) {
      assignmentScrollAnchorRef.current = null;
      setSubmitFeedback({
        message: `A batch supports up to ${bulkListingMaxItems} items. Save this batch and start another to add more.`,
        tone: "danger"
      });
      return;
    }
    const targetItemId = newItem?.clientId ?? itemClientId;
    setItems((currentItems) =>
      (newItem ? [...currentItems, newItem] : currentItems).map((item) => {
        const withoutFile = removeFileId(item, fileId);

        if (!kind || item.clientId !== targetItemId) {
          return withoutFile;
        }

        if (kind === "image") {
          const imageFileIds = [...withoutFile.imageFileIds, fileId];

          return {
            ...withoutFile,
            imageFileIds,
            imageOrder: imageFileIds,
            primaryImageFileId: withoutFile.primaryImageFileId ?? fileId
          };
        }

        if (withoutFile.videoFileIds.length >= bulkListingVideoMaxCount) {
          return withoutFile;
        }

        return {
          ...withoutFile,
          videoFileIds: [...withoutFile.videoFileIds, fileId]
        };
      })
    );
    if (newItem) {
      setSubmitFeedback({
        message: `Item ${items.length + 1} created and ${selectedMedia!.file.name} assigned to it. Add its details in the new row.`,
        tone: "success"
      });
    }
  }

  async function importCsv(file: File | null) {
    clearSubmissionState();

    if (!file) {
      return;
    }

    const parsed = parseBulkListingCsv(await file.text());
    setCsvIssues(parsed.issues);

    if (parsed.issues.some((issue) => issue.severity === "error")) {
      return;
    }

    setItems(applyAutoMatch(parsed.items, media));

    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  }

  function addMediaFiles(files: FileList | File[] | null) {
    clearSubmissionState();

    if (!files || files.length === 0) {
      return;
    }

    const addedMedia = Array.from(files).map((file) => ({
        file,
        id: createClientId("media")
      }));
    const nextMedia = [...media, ...addedMedia];

    setMedia(nextMedia);
    setItems((currentItems) => appendBulkListingMedia(currentItems, toMediaInputs(addedMedia)));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function addSavedPhotos(photos: SavedInboxPhoto[]) {
    clearSubmissionState();
    const existingIds = new Set(media.map((entry) => entry.savedPhotoId).filter(Boolean));
    const addedMedia = photos.filter((photo) => !existingIds.has(photo.id)).map(savedPhotoMedia);
    setMedia((current) => [...current, ...addedMedia]);
    setItems((current) => appendBulkListingMedia(current, toMediaInputs(addedMedia)));
  }

  function removeMedia(fileId: string) {
    clearSubmissionState();
    setMedia((currentMedia) => currentMedia.filter((entry) => entry.id !== fileId));
    setItems((currentItems) => currentItems.map((item) => removeFileId(item, fileId)));
  }

  function getMediaName(fileId: string) {
    return media.find((entry) => entry.id === fileId)?.file.name ?? fileId;
  }

  function getItemIssues(clientId: string, severity?: "error" | "warning") {
    return allIssues.filter(
      (issue) =>
        issue.itemClientId === clientId && (!severity || issue.severity === severity)
    );
  }

  function getFileIssues(fileId: string) {
    return allIssues.filter((issue) => issue.fileId === fileId);
  }

  function getAssignedItemLabel(fileId: string) {
    const assignedItemId = getAssignedItemId(fileId);
    const assignedItem = items.find((item) => item.clientId === assignedItemId);

    if (!assignedItem) {
      return "Unassigned";
    }

    return assignedItem.sku || assignedItem.title || `Item ${items.indexOf(assignedItem) + 1}`;
  }

  async function resetWorkspace() {
    if (progress.busy || isSubmitting) return;
    const hasWorkspaceData =
      items.length > 1 ||
      media.length > 0 ||
      csvIssues.length > 0 ||
      serverIssues.length > 0 ||
      createdListingIds.length > 0 ||
      items.some(
        (item) =>
          item.sku ||
          item.title ||
          item.description ||
          item.condition ||
          item.mediaPrefix ||
          item.priceCents ||
          item.startingBidCents ||
          item.endAtUtc ||
          item.imageFileIds.length > 0 ||
          item.videoFileIds.length > 0
      );

    if (
      hasWorkspaceData &&
      typeof window !== "undefined" &&
      !window.confirm("Save this batch and start a new workspace? You can resume the saved batch later.")
    ) {
      return;
    }
    if (hasWorkspaceData && !createdListingIds.length && !await progress.save()) return;
    progress.startNew();

    descriptionRunRef.current?.abort();
    descriptionRunRef.current = null;
    setIsDescribing(false);
    setDescriptionDrafts({});
    setAiSaleContext(defaultListingSaleContext);
    setFirstImageOnly(true);
    setDescriptionSelectionOverrides({});
    setEditingInstructions({});
    setDescriptionMessage("");
    setDescriptionProgress({ completed: 0, total: 0 });
    setItems([createBlankItem(categories, defaultCategorySlug)]);
    setMedia([]);
    setCsvIssues([]);
    setServerIssues([]);
    setSubmitFeedback(null);
    setCreatedListingIds([]);
    setSharedClosing(true); setSharedEndAtUtc(auctionEndAfter("10", "days") ?? ""); setDuration("10"); setDurationUnit("days"); setSaveAs("draft");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  }

  async function submitBatch() {
    if (descriptionRunRef.current || isSubmitting || createdListingIds.length) {
      return;
    }
    setSubmitFeedback(null);
    setServerIssues([]);
    setCreatedListingIds([]);

    if (isOverRequestCap || validation.hasErrors || (sharedClosing && items.some((item) => item.listingType === "auction") && (!sharedEndAtUtc || new Date(sharedEndAtUtc).getTime() <= Date.now()))) {
      setSubmitFeedback({
        message: "Resolve validation errors and choose a future auction end before creating draft listings.",
        tone: "danger"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const savedWorkspace = await progress.save();
      if (!savedWorkspace) { setSubmitFeedback({ message: "Save progress must finish before creating listings. Check the progress message above and retry.", tone: "danger" }); return; }
      const savedMedia = savedWorkspace.snapshot.media;
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          allowIncompleteDraftRows: false,
          saveAs,
          items: scheduledItems,
          workspace: { id: savedWorkspace.id, version: savedWorkspace.version },
          savedPhotos: savedMedia.flatMap((entry) => entry.savedPhotoId ? [{ id: entry.id, savedPhotoId: entry.savedPhotoId }] : []),
          savedAssets: savedMedia.flatMap((entry) => entry.savedAssetId ? [{ id: entry.id, assetId: entry.savedAssetId }] : [])
        })
      );

      const response = await fetch("/api/admin/listings/bulk", {
        body: formData,
        method: "POST"
      });
      const result = (await response.json()) as {
        issues?: BulkListingValidationIssue[];
        listingIds?: string[];
        message?: string;
        warnings?: BulkListingValidationIssue[];
      };

      if (!response.ok) {
        setServerIssues(result.issues ?? []);
        setSubmitFeedback({
          message:
            result.message ?? "Bulk listing creation failed. Review the validation messages.",
          tone: "danger"
        });
        return;
      }

      const listingIds = result.listingIds ?? [];
      setServerIssues(result.warnings ?? []);
      setCreatedListingIds(listingIds);
      await progress.markCompleted(listingIds);
      setCreatedTitles(Object.fromEntries(listingIds.map((id, index) => [id, items[index]?.title || `Item ${index + 1}`])));
      setCreatedPublished(saveAs === "published");
      setSubmitFeedback({
        message: `${listingIds.length} listing${listingIds.length === 1 ? "" : "s"} ${saveAs === "published" ? "published and live" : "saved as drafts"}.`,
        tone: "success"
      });
    } catch {
      setSubmitFeedback({ message: "The response was interrupted. Check Admin listings before retrying to avoid duplicates.", tone: "danger" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 bulk-listing-workspace">
      <details aria-label="Batch controls" className="bulk-action-bar bulk-window" open>
        <summary><span>Batch controls</span><span>{items.length} item{items.length === 1 ? "" : "s"} · {rowCounts.blocked} blocked</span></summary>
        <div className="bulk-control-grid mt-4">
          <label className="space-y-1 text-sm"><span>Default category for new items</span>
            <select value={defaultCategorySlug} onChange={(event) => {
              if (event.currentTarget.value === "__add_category__") setCategoryModalTarget("__default__");
              else setDefaultCategorySlug(event.currentTarget.value);
            }}>
              {categories.map((category) => <option key={category.id} value={category.slug}>{category.name} — {formatBidTierLabel(category.requiredBidTier, verificationPolicy)}</option>)}
              <option value="__add_category__">+ Add new category…</option>
            </select>
          </label>
          <button className="button-secondary self-end px-3 py-2 text-sm" onClick={() => setCategoryModalTarget("__default__")} type="button">Add category</button>
          <label className="space-y-1 text-sm"><span>Create mode</span>
            <select value={saveAs} onChange={(event) => setSaveAs(event.currentTarget.value as "draft" | "published")}>
              <option value="draft">Save drafts for review</option><option value="published">Publish now</option>
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Batch name</span>
            <input maxLength={160} value={progress.name} disabled={!progress.ready || isSubmitting || createdListingIds.length > 0} onChange={(event) => progress.setName(event.currentTarget.value)} />
          </label>
          <button className="button-primary self-end px-4 py-2 disabled:opacity-50" type="button" disabled={!progress.ready || progress.busy || isSubmitting || createdListingIds.length > 0} onClick={() => void progress.save()}>{progress.busy ? "Saving progress…" : "Save your place"}</button>
        </div>
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium">{progress.message}</p>
        <p className="mt-1 text-xs">The batch, unfinished rows, photos, videos, AI previews, and auction end are saved together. Saving progress does not create or publish listings. A recovery copy is also kept in this browser when available.</p>
        {progress.recoveries.filter((row) => !row.listingIds.length && row.recoveryKey !== progress.activeRecoveryKey).length > 0 ? <details className="bulk-nested-window mt-3"><summary>Recover work from this device</summary><ul className="mt-2 space-y-2">
          {progress.recoveries.filter((row) => !row.listingIds.length && row.recoveryKey !== progress.activeRecoveryKey).map((row) => <li key={row.recoveryKey} className="flex flex-wrap items-center gap-3 text-sm"><span>{row.name} · {new Date(row.updatedAtUtc).toLocaleString()} · {row.snapshot.items.length} items</span><button type="button" className="button-secondary px-3 py-1" disabled={progress.busy || isSubmitting || isDescribing} onClick={() => void progress.resume(row.id, row)}>Recover this batch</button></li>)}
        </ul></details> : null}
        <details className="bulk-nested-window mt-3"><summary>Saved batches ({progress.saved.length})</summary>
          <button type="button" className="button-secondary mt-3 px-3 py-1 text-sm" onClick={() => void progress.refresh().catch(() => {})}>Refresh saved batches</button>
          <ul className="mt-3 space-y-3">{progress.saved.map((row) => <li className="flex flex-wrap items-center gap-3 text-sm" key={row.id}>
            <span className="min-w-0 flex-1">{row.name} · {new Date(row.updatedAtUtc).toLocaleString()}{row.listingIds.length ? ` · ${row.listingIds.length} listings created` : ""}</span>
            <button type="button" className="button-secondary px-3 py-1" disabled={progress.busy || isSubmitting || isDescribing} onClick={() => void progress.resume(row.id)}>{row.listingIds.length ? "View batch" : "Resume batch"}</button>
            <button type="button" className="button-ghost px-3 py-1" disabled={row.id === progress.activeId || progress.busy || isSubmitting || isDescribing} onClick={() => void progress.remove(row)}>Delete saved batch</button>
          </li>)}</ul>
        </details>
      </details>
      <details className="bulk-window" open>
        <summary><span>Photo inbox</span><span>Choose saved photos for this batch</span></summary>
        <div className="mt-4"><PhotoInbox currentFiles={localMediaFiles(media)} onUsePhotos={addSavedPhotos} disabled={!progress.ready || isSubmitting || isDescribing || createdListingIds.length > 0} /></div>
      </details>
      {createdListingIds.length > 0 ? <div ref={batchResultRef} className="notice notice-success scroll-mt-4"><p>{createdPublished ? "Your batch is published and live." : "Your drafts are saved. Publish them together below or return to Admin listings later."}</p><button className="button-secondary px-4 py-2" type="button" onClick={resetWorkspace}>Start another batch</button></div> : null}
      {createdListingIds.length > 0 && !createdPublished ? <ListingBatchControls allSelected listings={createdListingIds.map((id) => ({ id, title: createdTitles[id] || id, status: "draft" }))}
        onPublished={(ids) => { if (ids.length === createdListingIds.length) setCreatedPublished(true); else setCreatedListingIds((current) => current.filter((id) => !ids.includes(id))); setSubmitFeedback({ message: `${ids.length} listing${ids.length === 1 ? "" : "s"} published and live.`, tone: "success" }); }}
        onDeleted={(ids) => { const remaining = createdListingIds.filter((id) => !ids.includes(id)); setCreatedListingIds(remaining); if (!remaining.length) { setItems([createBlankItem(categories)]); setMedia([]); } setSubmitFeedback({ message: `${ids.length} drafts deleted.`, tone: "success" }); }} /> : null}
      <div className="bulk-workspace-columns">
      <details className="bulk-window bulk-ai-window" open>
        <summary><span>AI listing drafts</span><span>{selectedDescribableItems.length} selected</span></summary>
        <div className="bulk-ai-window__body mt-4 space-y-3">
        <h3 className="text-lg font-semibold">Describe selected items</h3>
        <p className="text-sm">
          Choose which eligible listings to describe. AI works through the selection one item at a time. Each item uses one request; videos are not analyzed. Review every preview before applying it.
        </p>
        <label className="block space-y-2 text-sm"><span>AI context for this sale</span>
          <textarea maxLength={descriptionSaleContextMaxCharacters} value={aiSaleContext} onChange={(event) => setAiSaleContext(event.currentTarget.value)} />
          <span className="block text-xs">Seller context applies to this batch. Item-specific disclosures take priority.</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input checked={firstImageOnly} disabled={!aiEnabled || isDescribing || isSubmitting || createdListingIds.length > 0} onChange={(event) => setFirstImageOnly(event.currentTarget.checked)} type="checkbox" />
          Analyze only the first (primary) image per listing
        </label>
        <p className="text-xs">Turn this off to analyze up to {descriptionPhotoMaxCount} assigned photos per item.</p>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input checked={includePriceSuggestion} disabled={!aiEnabled || isDescribing || isSubmitting || createdListingIds.length > 0} onChange={(event) => setIncludePriceSuggestion(event.currentTarget.checked)} type="checkbox" />
          Also suggest a price
        </label>
        <p className="text-xs text-zinc-600">Uses the same AI request. Review each estimate, then apply all suggestions together or apply the price separately. Recent sold listings are not checked.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="button-secondary px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!aiEnabled || isDescribing || isSubmitting || selectedDescribableItems.length === 0 || createdListingIds.length > 0}
            onClick={() => void describePhotos()}
            type="button"
          >{hasPausedDescriptionWork ? `Resume remaining items (${selectedDescribableItems.length})` : `Describe selected items (${selectedDescribableItems.length})`}</button>
          {isDescribing ? (
            <>
              <button className="button-secondary px-4 py-2 text-sm" onClick={() => descriptionRunRef.current?.abort()} type="button">Stop AI drafting</button>
              <button className="button-ghost px-3 py-2 text-sm text-red-700" onClick={resetWorkspace} type="button">Reset workspace</button>
            </>
          ) : null}
        </div>
        {!aiEnabled ? <p className="text-sm text-zinc-600">AI drafting is currently turned off. You can write and save descriptions as usual.</p> : null}
        <p aria-live="polite" className="text-sm text-zinc-700" role="status">
          {descriptionProgress.total > 0 ? `${descriptionProgress.completed} of ${descriptionProgress.total} items processed. ` : ""}
          {descriptionMessage}
        </p>
        </div>
      </details>
      <div className="bulk-edit-column">
      <fieldset className="min-w-0 space-y-6" disabled={!progress.ready || isDescribing || isSubmitting || createdListingIds.length > 0}>
      <details className="bulk-window" open>
      <summary><span>Auction settings</span><span>{sharedClosing ? "One shared closing time" : "Set times per item"}</span></summary>
      <section className="surface-card mt-3 space-y-4 p-5">
        <h3 className="text-lg font-semibold text-zinc-950">One closing time for the auction</h3>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={sharedClosing} onChange={(event) => { clearSubmissionState(); setSharedClosing(event.currentTarget.checked); }} />
          Use one auction end for all items
        </label>
        <p className="text-sm text-zinc-600">Start with a 10-day auction or choose your own duration or exact closing time. This applies to all auction rows, including later additions and CSV imports. Fixed-price items are unaffected.</p>
        {sharedClosing ? <>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm text-zinc-700"><span>Duration</span>
              <input type="number" min="0.001" step="any" value={duration} onChange={(event) => { const value = event.currentTarget.value; setDuration(value); setSharedEndAtUtc(auctionEndAfter(value, durationUnit) ?? ""); clearSubmissionState(); }} />
            </label>
            <label className="space-y-2 text-sm text-zinc-700"><span>Duration unit</span>
              <select value={durationUnit} onChange={(event) => { const unit = event.currentTarget.value as AuctionDurationUnit; setDurationUnit(unit); setSharedEndAtUtc(auctionEndAfter(duration, unit) ?? ""); clearSubmissionState(); }}>
                <option value="days">Days</option><option value="hours">Hours</option><option value="minutes">Minutes</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-zinc-700"><span>Shared auction end</span>
              <input type="datetime-local" value={isClient ? auctionEndToLocalInput(sharedEndAtUtc) : ""} onChange={(event) => { setSharedEndAtUtc(localAuctionEndToUtc(event.currentTarget.value) ?? ""); clearSubmissionState(); }} />
            </label>
          </div>
          <p className="text-sm text-zinc-700">{!isClient ? "Closing times will be displayed in your local time zone." : sharedEndAtUtc ? `All auction items close ${new Date(sharedEndAtUtc).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}${timeZone ? ` (${timeZone})` : ""}.` : "Choose a valid closing time or a duration of at least one minute."}</p>
          <p className="text-xs text-zinc-600">Changing the duration calculates a new closing time from now. The chosen time stays fixed while you upload and publish. Uncheck above to use separate item end times; no listings are published automatically.</p>
        </> : <p className="text-sm text-zinc-600">Set each auction end in its row. Times use your local time zone{timeZone ? ` (${timeZone})` : ""}.</p>}
        <p className="text-sm text-zinc-700">{describeVerificationPolicy(verificationPolicy)} <Link href="/admin/settings/verification" className="font-medium underline">Edit deposit tiers</Link></p>
      </section>
      </details>
      <details className="bulk-window">
      <summary><span>Batch status</span><span>{rowCounts.ready} ready · {rowCounts.warning} warnings · {rowCounts.blocked} blocked</span></summary>
      <section className="surface-card mt-3 grid gap-4 p-5 md:grid-cols-6">
        <div>
          <span className="meta-label">Total rows</span>
          <span className="meta-value tabular-data">{rowCounts.total}</span>
        </div>
        <div>
          <span className="meta-label">Ready rows</span>
          <span className="meta-value tabular-data">{rowCounts.ready}</span>
        </div>
        <div>
          <span className="meta-label">Warning rows</span>
          <span className="meta-value tabular-data">{rowCounts.warning}</span>
        </div>
        <div>
          <span className="meta-label">Blocked rows</span>
          <span className="meta-value tabular-data">{rowCounts.blocked}</span>
        </div>
        <div>
          <span className="meta-label">Selected media size</span>
          <span className="meta-value tabular-data">
            {formatBytes(totalSelectedBytes)} / 1 GB
          </span>
        </div>
        <div>
          <span className="meta-label">Blocking issues</span>
          <span className="meta-value tabular-data">{blockingIssues.length}</span>
        </div>
      </section>
      </details>

      {isOverRequestCap ? (
        <div className="notice notice-danger">
          Selected media exceeds 1 GB. Choose fewer photos for this batch.
        </div>
      ) : null}
      {submitFeedback ? (
        <div
          className={
            submitFeedback.tone === "success" ? "notice notice-success" : "notice notice-danger"
          }
        >
          {submitFeedback.message}
        </div>
      ) : null}

      {createdListingIds.length > 0 ? (
        <section className="surface-card space-y-3 p-5">
          <h3 className="text-lg font-semibold text-zinc-950">{createdPublished ? "Published listings" : "Saved draft listings"}</h3>
          <div className="flex flex-wrap gap-2">
            {createdListingIds.map((listingId, index) => (
              <Link
                key={listingId}
                className="button-secondary px-3 py-2 text-sm font-medium"
                href={`/admin/listings/${listingId}/edit`}
              >
                {createdTitles[listingId] || `${createdPublished ? "Listing" : "Draft"} ${index + 1}`}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <details className="bulk-window" open>
      <summary><span>Import listings and media</span><span>CSV, photos, and videos</span></summary>
      <section className="surface-card mt-3 space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 basis-64 flex-1 space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Import CSV</span>
            <input
              ref={csvInputRef}
              accept=".csv,text/csv"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              onChange={(event) => void importCsv(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
            <span className="block text-xs text-zinc-500">Use price and startingBid columns with dollar amounts, such as 12.50.</span>
          </label>
          <label className="min-w-0 basis-64 flex-1 space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Upload photos and videos</span>
            <input
              ref={fileInputRef}
              accept={acceptedMediaValue}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              multiple
              onChange={(event) => addMediaFiles(event.currentTarget.files)}
              type="file"
            />
          </label>
          <button
            className="button-secondary px-4 py-2 text-sm font-medium"
            onClick={() => {
              clearSubmissionState();
              setItems((currentItems) => applyAutoMatch(currentItems, media));
            }}
            type="button"
          >
            Auto-match media
          </button>
          <button
            className="button-ghost px-0 py-2 text-sm font-medium text-red-700"
            onClick={resetWorkspace}
            type="button"
          >
            Reset workspace
          </button>
        </div>

        {csvIssues.length > 0 ? (
          <div className="space-y-2">
            {csvIssues.map((issue, index) => (
              <p
                key={`${issue.code}-${index}`}
                className={issue.severity === "error" ? "notice notice-danger" : "notice notice-info"}
              >
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      </details>

      <details className="bulk-window" open>
      <summary><span>Items</span><span>{rowCounts.total} total · {rowCounts.blocked} blocked</span></summary>
      <section className="bulk-item-scroll mt-3 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-950">Batch rows</h3>
          <div className="flex flex-wrap gap-3">
            <button
              className="button-secondary px-4 py-2 text-sm font-medium"
              onClick={() => {
                clearSubmissionState();
                setItems((currentItems) => [...currentItems, createBlankItem(categories, defaultCategorySlug)]);
              }}
              type="button"
            >
              Add item
            </button>
            <button
              className="button-secondary px-4 py-2 text-sm font-medium"
              onClick={() => {
                clearSubmissionState();
                setItems((currentItems) => [
                  ...currentItems,
                  duplicateItem(currentItems[currentItems.length - 1] ?? createBlankItem(categories, defaultCategorySlug))
                ]);
              }}
              type="button"
            >
              Duplicate previous
            </button>
          </div>
        </div>

        {items.map((item, index) => {
          const itemErrors = getItemIssues(item.clientId, "error");
          const itemWarnings = getItemIssues(item.clientId, "warning");
          const descriptionDraft = descriptionDrafts[item.clientId];
          const descriptionPhotoIds = getBulkDescriptionPhotoIds(item, firstImageOnly);
          const isAiEligible = describableItems.some((eligible) => eligible.clientId === item.clientId);
          const isDescriptionStale = descriptionDraft?.status === "ready" &&
            !canApplyBulkDescriptionDraft(item, descriptionDraft, descriptionSourceOptions);

          return (
            <article
              key={item.clientId}
              className={[
                "surface-card min-w-0 space-y-5 p-5",
                itemErrors.length > 0
                  ? "border-red-300 ring-1 ring-red-200"
                  : itemWarnings.length > 0
                    ? "border-amber-300"
                    : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Item {index + 1}</p>
                  {(() => {
                    const assignedImages = media.filter((entry) => item.imageFileIds.includes(entry.id));
                    const assignedVideos = media.filter((entry) => item.videoFileIds.includes(entry.id));
                    return assignedImages.length || assignedVideos.length ? (
                      <div className="bulk-item-media-preview mt-3 space-y-3">
                        {assignedImages.length ? <PhotoThumbnails files={localMediaFiles(assignedImages.slice(0, 3))} images={savedMediaPreviews(assignedImages.slice(0, 3))} label={`Photos for item ${index + 1}`} /> : null}
                        {assignedImages.length > 3 ? <p className="text-xs text-zinc-600">And {assignedImages.length - 3} more assigned photo{assignedImages.length === 4 ? "" : "s"}.</p> : null}
                        {assignedVideos.length ? <div className="grid gap-3 sm:grid-cols-2">{assignedVideos.map((entry) => <AssignedVideoPreview entry={entry} key={entry.id} />)}</div> : null}
                      </div>
                    ) : <p className="mt-2 text-xs text-zinc-600">No photos or videos assigned yet.</p>;
                  })()}
                  <h4 className="text-lg font-semibold text-zinc-950">
                    {item.title || "Untitled listing"}
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
                  <label className="bulk-select-item">
                    <input aria-label={`Select item ${index + 1} for AI description`} checked={isAiEligible && descriptionSelectionOverrides[item.clientId] !== false}
                      disabled={!isAiEligible || isDescribing || isSubmitting} onChange={(event) => setDescriptionSelectionOverrides((current) => ({ ...current, [item.clientId]: event.currentTarget.checked }))} type="checkbox" />
                    <span>{isAiEligible ? "Select for AI" : descriptionDraft?.status === "ready" || descriptionDraft?.status === "applied" ? "AI preview ready" : "Not AI eligible"}</span>
                  </label>
                  {itemErrors.length > 0 ? (
                    <StatusBadge label="Blocked" status="blocked" />
                  ) : itemWarnings.length > 0 ? (
                    <StatusBadge label="Warnings" status="pending_review" />
                  ) : (
                    <StatusBadge label="Ready" status="approved" />
                  )}
                  <span className="status-badge status-muted">
                    {item.imageFileIds.length} photos
                  </span>
                  <span className="status-badge status-muted">
                    {item.videoFileIds.length} videos
                  </span>
                  {items.length > 1 ? (
                    <button
                      className="button-ghost px-0 py-0 text-sm font-medium text-red-700"
                      onClick={() => {
                        clearSubmissionState();
                        setItems((currentItems) =>
                          currentItems.filter((currentItem) => currentItem.clientId !== item.clientId)
                        );
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {itemErrors.length > 0 ? (
                <div className="notice notice-danger space-y-2">
                  <p className="font-medium">Fix these before drafts can be created:</p>
                  <ul className="list-inside list-disc">
                    {itemErrors.map((issue, issueIndex) => (
                      <li key={`${issue.code}-${issueIndex}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {itemWarnings.length > 0 ? (
                <div className="notice notice-info space-y-2">
                  <p className="font-medium">Warnings for this draft row:</p>
                  <ul className="list-inside list-disc">
                    {itemWarnings.map((issue, issueIndex) => (
                      <li key={`${issue.code}-${issueIndex}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">SKU</span>
                  <input
                    placeholder="Assigned on import"
                    value={item.sku}
                    onChange={(event) => updateItem(item.clientId, { sku: event.currentTarget.value })}
                    type="text"
                  />
                  <span className="block text-xs text-zinc-500">Leave blank for an automatic SKU, such as 000001. You can enter your own SKU.</span>
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Media prefix</span>
                  <input
                    value={item.mediaPrefix ?? ""}
                    onChange={(event) =>
                      updateItem(item.clientId, { mediaPrefix: event.currentTarget.value })
                    }
                    type="text"
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Title</span>
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(item.clientId, { title: event.currentTarget.value })}
                    type="text"
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Category</span>
                  <select
                    value={item.categorySlug}
                    onChange={(event) => {
                      if (event.currentTarget.value === "__add_category__") setCategoryModalTarget(item.clientId);
                      else updateItem(item.clientId, { categorySlug: event.currentTarget.value });
                    }}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name} — {formatBidTierLabel(category.requiredBidTier, verificationPolicy)}
                      </option>
                    ))}
                    <option value="__add_category__">+ Add new category…</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Description</span>
                <textarea
                  value={item.description}
                  onChange={(event) =>
                    updateItem(item.clientId, { description: event.currentTarget.value })
                  }
                />
              </label>

              <div className="bulk-ai-editor min-w-0 space-y-3 rounded-lg border p-4">
                <p className="text-xs text-zinc-600">Edit the description directly above, or tell AI how to revise it below.</p>
                <label className="block space-y-2 text-sm text-zinc-700"><span>AI editing instructions</span>
                  <textarea maxLength={2000} value={editingInstructions[item.clientId] ?? ""} placeholder="For example: shorten this to two sentences and keep the scratch and missing-part details."
                    onChange={(event) => { const value = event.currentTarget.value; setEditingInstructions((current) => ({ ...current, [item.clientId]: value })); setDescriptionDrafts((current) => { const next = { ...current }; delete next[item.clientId]; return next; }); }} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button className="button-secondary px-3 py-2 text-sm disabled:opacity-50" type="button"
                    disabled={!aiEnabled || !item.description.trim() || !editingInstructions[item.clientId]?.trim() || (item.title.trim().length < 3 && descriptionPhotoIds.length === 0)}
                    onClick={() => void describePhotos(item, true)}>Revise description with AI</button>
                  <button
                    className="button-secondary px-3 py-2 text-sm disabled:opacity-50"
                    disabled={!aiEnabled || descriptionPhotoIds.length === 0}
                    onClick={() => void describePhotos(item)}
                    type="button"
                  >Describe this item</button>
                  <span className="text-xs text-zinc-600">Uses {descriptionPhotoIds.length} of {item.imageFileIds.length} assigned photos.</span>
                </div>
                {descriptionPhotoIds.length > 0 ? <p className="break-words text-xs text-zinc-600">Photos for AI: {descriptionPhotoIds.map(getMediaName).join(", ")}</p> : <p className="text-xs text-zinc-600">Assign this item&apos;s photos below to create a title and description preview.</p>}
                {item.imageFileIds.length > (firstImageOnly ? 1 : descriptionPhotoMaxCount) ? <p className="text-xs text-zinc-600">AI will analyze {firstImageOnly ? "only the first (primary) photo" : `up to ${descriptionPhotoMaxCount} photos, primary first`}. All original photos stay in the listing.</p> : null}
                {descriptionDraft ? <p aria-live="polite" className={descriptionDraft.status === "error" ? "text-sm text-red-700" : "text-sm text-zinc-700"} role="status">{descriptionDraft.message}</p> : null}
                {descriptionDraft?.status === "ready" && descriptionDraft.title && descriptionDraft.description ? (
                  <div className="space-y-3 border-t border-zinc-200 pt-3">
                    <p className="text-sm font-semibold text-zinc-900">AI draft preview</p>
                    {!descriptionDraft.descriptionOnly ? <div className="space-y-1">
                      <p className="text-xs font-medium text-zinc-600">Suggested title</p>
                      <p className="break-words text-sm font-semibold text-zinc-900">{descriptionDraft.title}</p>
                    </div> : null}
                    <p className="text-xs font-medium text-zinc-600">Suggested description</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-zinc-700">{descriptionDraft.description}</p>
                    {!descriptionDraft.descriptionOnly ? <><p className="text-xs font-medium text-zinc-600">Estimated condition</p><p className="whitespace-pre-wrap text-sm text-zinc-700">{descriptionDraft.conditionNote}</p></> : null}
                    <p className="text-xs text-zinc-600">{descriptionDraft.descriptionOnly ? "Only the description will change; your title, condition and price stay as entered." : "Review the item identification, visible condition, and included parts against your sale context. Applying fills the title, description and condition; every field stays editable."}</p>
                    {isDescriptionStale ? <p className="text-sm text-amber-800">This item&apos;s details or photos changed. Generate a new preview before applying.</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <button className="button-secondary px-3 py-2 text-sm disabled:opacity-50" disabled={isDescriptionStale} onClick={() => applyDescriptionDraft(item)} type="button">{descriptionDraft.descriptionOnly ? "Apply revised description" : "Apply title, description and condition"}</button>
                      {!descriptionDraft.descriptionOnly && getBulkPriceSuggestionChanges(item, descriptionDraft, descriptionSourceOptions) ? <button className="button-primary px-3 py-2 text-sm" onClick={() => applyDescriptionDraft(item, true)} type="button">Apply all suggestions</button> : null}
                      <button className="button-ghost px-3 py-2 text-sm" onClick={() => setDescriptionDrafts((current) => ({ ...current, [item.clientId]: { ...descriptionDraft, status: "discarded", title: undefined, description: undefined, priceSuggestion: undefined, message: "Remaining suggestions discarded. Your current fields have not changed." } }))} type="button">Discard draft</button>
                    </div>
                  </div>
                ) : null}
                {descriptionDraft && ["ready", "applied"].includes(descriptionDraft.status) && descriptionDraft.priceSuggestion !== undefined ? <>
                  <PriceSuggestionPreview suggestion={descriptionDraft.priceSuggestion} listingType={descriptionDraft.pricingListingType ?? item.listingType}
                    applied={descriptionDraft.priceApplied} disabled={!getBulkPriceSuggestionChanges(item, descriptionDraft, descriptionSourceOptions)}
                    onApply={() => applyPriceSuggestion(item)} />
                  {!descriptionDraft.priceApplied && descriptionDraft.sourceKey !== getBulkDescriptionSourceKey(item, descriptionSourceOptions) ? <p className="text-sm text-amber-800">Item details, photos, sale context, or price changed. Generate a fresh price suggestion to preserve your edits.</p> : null}
                  {descriptionDraft.status === "applied" ? <button className="button-ghost px-3 py-2 text-sm" type="button"
                    onClick={() => setDescriptionDrafts((current) => ({ ...current, [item.clientId]: { ...descriptionDraft, priceSuggestion: undefined } }))}>Dismiss price suggestion</button> : null}
                </> : null}
              </div>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Condition</span>
                <textarea
                  value={item.condition ?? ""}
                  onChange={(event) =>
                    updateItem(item.clientId, { condition: event.currentTarget.value })
                  }
                />
              </label>

              <div className="grid gap-4 md:grid-cols-4">
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Listing type</span>
                  <select
                    value={item.listingType}
                    onChange={(event) =>
                      updateItem(item.clientId, {
                        listingType: event.currentTarget.value as BulkListingItemInput["listingType"]
                      })
                    }
                  >
                    <option value="auction">Auction (optional Buy It Now)</option>
                    <option value="fixed_price">Fixed price</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Buy It Now price ($)</span>
                  <MoneyInput
                    valueCents={item.priceCents ?? ""}
                    placeholder="Optional for auctions"
                    onChangeCents={(priceCents) =>
                      updateItem(item.clientId, { priceCents })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Starting bid ($)</span>
                  <MoneyInput
                    valueCents={item.startingBidCents ?? ""}
                    onChangeCents={(startingBidCents) =>
                      updateItem(item.clientId, { startingBidCents })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Auction end</span>
                  <input
                    type="datetime-local"
                    disabled={sharedClosing && item.listingType === "auction"}
                    value={isClient ? auctionEndToLocalInput(sharedClosing && item.listingType === "auction" ? sharedEndAtUtc : item.endAtUtc ?? "") : ""}
                    onChange={(event) =>
                      updateItem(item.clientId, { endAtUtc: localAuctionEndToUtc(event.currentTarget.value) ?? "" })
                    }
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h5 className="text-base font-semibold text-zinc-950">Photos</h5>
                  {item.imageFileIds.length === 0 ? (
                    <p className="bulk-empty-line">No photos assigned.</p>
                  ) : (
                    <div className="space-y-2">
                      {item.imageFileIds.map((fileId, imageIndex) => (
                        <div
                          key={fileId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-sm"
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              checked={item.primaryImageFileId === fileId}
                              name={`primary-${item.clientId}`}
                              onChange={() =>
                                updateItem(item.clientId, { primaryImageFileId: fileId })
                              }
                              type="radio"
                            />
                            <span className="truncate">{getMediaName(fileId)}</span>
                          </label>
                          <div className="flex gap-2">
                            <button
                              className="button-secondary px-3 py-1 text-xs"
                              disabled={imageIndex === 0}
                              onClick={() => {
                                const nextImageIds = moveValue(item.imageFileIds, fileId, -1);
                                updateItem(item.clientId, {
                                  imageFileIds: nextImageIds,
                                  imageOrder: nextImageIds
                                });
                              }}
                              type="button"
                            >
                              Up
                            </button>
                            <button
                              className="button-secondary px-3 py-1 text-xs"
                              disabled={imageIndex === item.imageFileIds.length - 1}
                              onClick={() => {
                                const nextImageIds = moveValue(item.imageFileIds, fileId, 1);
                                updateItem(item.clientId, {
                                  imageFileIds: nextImageIds,
                                  imageOrder: nextImageIds
                                });
                              }}
                              type="button"
                            >
                              Down
                            </button>
                            <button
                              className="button-ghost px-0 py-0 text-xs font-medium text-red-700"
                              onClick={() => assignMedia(fileId, "")}
                              type="button"
                            >
                              Unassign
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h5 className="text-base font-semibold text-zinc-950">Videos</h5>
                  {item.videoFileIds.length === 0 ? (
                    <p className="bulk-empty-line">No videos assigned.</p>
                  ) : (
                    <div className="space-y-2">
                      {item.videoFileIds.map((fileId) => (
                        <div
                          key={fileId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{getMediaName(fileId)}</span>
                          <button
                            className="button-ghost px-0 py-0 text-xs font-medium text-red-700"
                            onClick={() => assignMedia(fileId, "")}
                            type="button"
                          >
                            Unassign
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      </details>
      <details className="bulk-window" open>
      <summary><span>Media assignments</span><span>{media.length} files · {mediaAssignmentCounts.unassigned} unassigned</span></summary>
      <section className="surface-card mt-3 space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-950">Photos and videos</h3>
                  <button
            className="button-secondary px-4 py-2 text-sm font-medium"
            onClick={() => {
              clearSubmissionState();
              setMedia([]);
              setItems((currentItems) =>
                currentItems.map((item) => ({
                  ...item,
                  imageFileIds: [],
                  imageOrder: [],
                  primaryImageFileId: null,
                  videoFileIds: []
                }))
              );
            }}
            type="button"
          >
            Clear media
          </button>
        </div>

        {media.length === 0 ? (
          <p className="bulk-empty-line">No media selected.</p>
        ) : (
          <div className="bulk-media-scroll space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="metric-card">
                <span className="meta-label">Assigned media</span>
                <span className="meta-value tabular-data">{mediaAssignmentCounts.assigned}</span>
              </div>
              <div className="metric-card">
                <span className="meta-label">Unassigned media</span>
                <span className="meta-value tabular-data">{mediaAssignmentCounts.unassigned}</span>
              </div>
            </div>
            {media.map((entry, mediaIndex) => {
              const kind = getBulkListingMediaKind({
                name: entry.file.name,
                type: entry.file.type
              });
              const fileIssues = getFileIssues(entry.id);
              const assignedItemId = getAssignedItemId(entry.id);
              const previousMedia = media[mediaIndex - 1];
              const previousItemId = previousMedia ? getAssignedItemId(previousMedia.id) : "";
              const previousItem = items.find((item) => item.clientId === previousItemId);
              const previousItemFull = kind === "video" &&
                (previousItem?.videoFileIds.length ?? 0) >= bulkListingVideoMaxCount;

              return (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-md border border-zinc-200 p-3 text-sm md:grid-cols-[minmax(0,1fr)_12rem_auto]"
                >
                  <div className="min-w-0 space-y-2">
                    {kind === "image" ? <PhotoThumbnails files={localMediaFiles([entry])} images={savedMediaPreviews([entry])} label={`Preview of ${entry.file.name}`} /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-zinc-950">{entry.file.name}</p>
                      <StatusBadge
                        label={kind === "video" ? "Video" : kind === "image" ? "Photo" : "Unsupported"}
                        status={kind ?? "blocked"}
                        tone={kind ? "info" : "danger"}
                      />
                      <StatusBadge
                        label={assignedItemId ? `Assigned: ${getAssignedItemLabel(entry.id)}` : "Unassigned"}
                        status={assignedItemId ? "approved" : "blocked"}
                      />
                      <button
                        className="button-secondary px-3 py-1.5 text-xs font-medium"
                        disabled={!kind || items.length >= bulkListingMaxItems}
                        onClick={(event) => assignMedia(entry.id, "__new_item__", event.currentTarget)}
                        type="button"
                      >
                        Create new item
                      </button>
                      <button
                        className="button-secondary px-3 py-1.5 text-xs font-medium"
                        disabled={!kind || !previousItemId || assignedItemId === previousItemId || previousItemFull}
                        onClick={(event) => assignMedia(entry.id, previousItemId, event.currentTarget)}
                        title={previousItemId
                          ? `Add to ${getAssignedItemLabel(previousMedia.id)}, the preceding file's item`
                          : "Assign the preceding photo or video to an item first"}
                        type="button"
                      >
                        Add to previous item
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">{formatBytes(entry.file.size)}</p>
                    {fileIssues.length > 0 ? (
                      <p className="mt-2 text-xs text-red-700">{issueText(fileIssues)}</p>
                    ) : null}
                  </div>
                  <label className="space-y-1 self-start">
                    <span className="block text-xs font-medium text-zinc-700">Add to</span>
                    <select
                      aria-label={`Assign ${entry.file.name} to item`}
                      value={getAssignedItemId(entry.id)}
                      onChange={(event) => assignMedia(entry.id, event.currentTarget.value, event.currentTarget)}
                    >
                      <option value="">Unassigned</option>
                      <option value="__new_item__" disabled={!kind || items.length >= bulkListingMaxItems}>
                        + New item{items.length >= bulkListingMaxItems ? " (100-item limit reached)" : ""}
                      </option>
                      {items.map((item, index) => (
                        <option key={item.clientId} value={item.clientId}>
                          {item.sku || item.title || `Item ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button-ghost px-0 py-0 text-sm font-medium text-red-700"
                    onClick={() => removeMedia(entry.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </details>

      <details className="bulk-window">
      <summary><span>Save or publish</span><span>{items.length} listing{items.length === 1 ? "" : "s"} · {blockingIssues.length} blocking issues</span></summary>
      <section className="surface-card mt-3 space-y-4 p-5">
        <div>
          <h3 className="text-lg font-semibold text-zinc-950">Save or publish the batch</h3>
          <p className="text-sm text-zinc-600">
            Save drafts for later review, or publish every item immediately. Publishing makes the items visible to buyers right away.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="metric-card">
            <span className="meta-label">Listings</span>
            <span className="meta-value tabular-data">{items.length}</span>
          </div>
          <div className="metric-card">
            <span className="meta-label">Photos</span>
            <span className="meta-value tabular-data">
              {items.reduce((sum, item) => sum + item.imageFileIds.length, 0)}
            </span>
          </div>
          <div className="metric-card">
            <span className="meta-label">Videos</span>
            <span className="meta-value tabular-data">
              {items.reduce((sum, item) => sum + item.videoFileIds.length, 0)}
            </span>
          </div>
          <div className="metric-card">
            <span className="meta-label">Warnings</span>
            <span className="meta-value tabular-data">{warningIssues.length}</span>
          </div>
        </div>
        {allIssues.length === 0 ? (
          <p className="notice notice-success">Batch is ready. Choose whether to save drafts or publish now.</p>
        ) : (
          <div className="space-y-2">
            {allIssues.slice(0, 8).map((issue, index) => (
              <p
                key={`${issue.code}-${index}`}
                className={issue.severity === "error" ? "notice notice-danger" : "notice notice-info"}
              >
                {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <button
            className="button-primary px-4 py-2 text-sm font-medium"
            disabled={isSubmitting || isOverRequestCap || validation.hasErrors || createdListingIds.length > 0}
            onClick={() => void submitBatch()}
            type="button"
          >
            {createdListingIds.length ? "Batch saved" : isSubmitting ? "Saving listings…" : saveAs === "published" ? "Publish all listings now" : "Create draft listings"}
          </button>
        </div>
      </section>
      </details>
      </fieldset>
    </div>
      </div>
      {categoryModalTarget !== null ? <QuickCategoryDialog onClose={() => setCategoryModalTarget(null)} onCreated={handleCategoryCreated} tierSettings={verificationPolicy} /> : null}
    </div>
  );
}
