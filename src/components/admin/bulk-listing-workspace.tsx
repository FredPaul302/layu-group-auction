"use client";

import type { Category } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  bulkListingImageAcceptedExtensions,
  bulkListingMaxRequestSizeBytes,
  bulkListingVideoAcceptedExtensions,
  bulkListingVideoMaxCount,
  type BulkListingItemInput,
  type BulkListingMediaInput,
  type BulkListingValidationIssue,
  getBulkListingMediaKind,
  matchBulkListingMedia,
  parseBulkListingCsv,
  validateBulkListingWorkspace
} from "@/lib/catalog/bulk-listings";

type BulkListingWorkspaceProps = {
  categories: Pick<Category, "id" | "name" | "slug">[];
};

type MediaEntry = {
  file: File;
  id: string;
};

const acceptedMediaValue = [
  ...bulkListingImageAcceptedExtensions,
  ...bulkListingVideoAcceptedExtensions
].join(",");

function createClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankItem(categories: BulkListingWorkspaceProps["categories"]): BulkListingItemInput {
  return {
    bidIncrementCents: "",
    categorySlug: categories[0]?.slug ?? "",
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

function duplicateItem(item: BulkListingItemInput): BulkListingItemInput {
  return {
    ...item,
    clientId: createClientId("item"),
    imageFileIds: [],
    imageOrder: [],
    primaryImageFileId: null,
    sku: item.sku ? `${item.sku}-copy` : "",
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
  return media.map(({ file, id }) => ({
    id,
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

export function BulkListingWorkspace({ categories }: BulkListingWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<BulkListingItemInput[]>(() => [createBlankItem(categories)]);
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [csvIssues, setCsvIssues] = useState<BulkListingValidationIssue[]>([]);
  const [serverIssues, setServerIssues] = useState<BulkListingValidationIssue[]>([]);
  const [submitFeedback, setSubmitFeedback] = useState<{
    message: string;
    tone: "danger" | "success";
  } | null>(null);
  const [createdListingIds, setCreatedListingIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaInputs = useMemo(() => toMediaInputs(media), [media]);
  const validation = useMemo(
    () =>
      validateBulkListingWorkspace({
        items,
        media: mediaInputs
      }),
    [items, mediaInputs]
  );
  const totalSelectedBytes = useMemo(
    () => media.reduce((sum, entry) => sum + entry.file.size, 0),
    [media]
  );
  const isOverRequestCap = totalSelectedBytes > bulkListingMaxRequestSizeBytes;
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

  function assignMedia(fileId: string, itemClientId: string) {
    clearSubmissionState();
    const selectedMedia = media.find((entry) => entry.id === fileId);
    const kind = selectedMedia
      ? getBulkListingMediaKind({
          name: selectedMedia.file.name,
          type: selectedMedia.file.type
        })
      : null;

    setItems((currentItems) =>
      currentItems.map((item) => {
        const withoutFile = removeFileId(item, fileId);

        if (!kind || item.clientId !== itemClientId) {
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

  function addMediaFiles(files: FileList | null) {
    clearSubmissionState();

    if (!files || files.length === 0) {
      return;
    }

    const nextMedia = [
      ...media,
      ...Array.from(files).map((file) => ({
        file,
        id: createClientId("media")
      }))
    ];

    setMedia(nextMedia);
    setItems((currentItems) => applyAutoMatch(currentItems, nextMedia));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

  function resetWorkspace() {
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
      !window.confirm("Clear this bulk workspace and start over?")
    ) {
      return;
    }

    setItems([createBlankItem(categories)]);
    setMedia([]);
    setCsvIssues([]);
    setServerIssues([]);
    setSubmitFeedback(null);
    setCreatedListingIds([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  }

  async function submitBatch() {
    setSubmitFeedback(null);
    setServerIssues([]);
    setCreatedListingIds([]);

    if (isOverRequestCap || validation.hasErrors) {
      setSubmitFeedback({
        message: "Resolve validation errors before creating draft listings.",
        tone: "danger"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          allowIncompleteDraftRows: false,
          items
        })
      );

      for (const entry of media) {
        formData.append(`media:${entry.id}`, entry.file, entry.file.name);
      }

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
      setSubmitFeedback({
        message: `${listingIds.length} draft listing${listingIds.length === 1 ? "" : "s"} created.`,
        tone: "success"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface-card grid gap-4 p-5 md:grid-cols-6">
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
          <span className="meta-label">Selected upload size</span>
          <span className="meta-value tabular-data">
            {formatBytes(totalSelectedBytes)} / {formatBytes(bulkListingMaxRequestSizeBytes)}
          </span>
        </div>
        <div>
          <span className="meta-label">Blocking issues</span>
          <span className="meta-value tabular-data">{blockingIssues.length}</span>
        </div>
      </section>

      {isOverRequestCap ? (
        <div className="notice notice-danger">
          Selected uploads exceed 128 MB. Split this batch before submitting.
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
          <h3 className="text-lg font-semibold text-zinc-950">Created draft listings</h3>
          <div className="flex flex-wrap gap-2">
            {createdListingIds.map((listingId, index) => (
              <Link
                key={listingId}
                className="button-secondary px-3 py-2 text-sm font-medium"
                href={`/admin/listings/${listingId}/edit`}
              >
                Draft {index + 1}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Import CSV</span>
            <input
              ref={csvInputRef}
              accept=".csv,text/csv"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              onChange={(event) => void importCsv(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <label className="min-w-64 flex-1 space-y-2 text-sm text-zinc-700">
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-950">Batch rows</h3>
          <div className="flex flex-wrap gap-3">
            <button
              className="button-secondary px-4 py-2 text-sm font-medium"
              onClick={() => {
                clearSubmissionState();
                setItems((currentItems) => [...currentItems, createBlankItem(categories)]);
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
                  duplicateItem(currentItems[currentItems.length - 1] ?? createBlankItem(categories))
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

          return (
            <article
              key={item.clientId}
              className={[
                "surface-card space-y-5 p-5",
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
                  <h4 className="text-lg font-semibold text-zinc-950">
                    {item.title || "Untitled listing"}
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
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
                    value={item.sku}
                    onChange={(event) => updateItem(item.clientId, { sku: event.currentTarget.value })}
                    type="text"
                  />
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
                    onChange={(event) =>
                      updateItem(item.clientId, { categorySlug: event.currentTarget.value })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
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
                    <option value="auction">Auction</option>
                    <option value="fixed_price">Fixed price</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Price cents</span>
                  <input
                    min={1}
                    step={1}
                    type="number"
                    value={item.priceCents ?? ""}
                    onChange={(event) =>
                      updateItem(item.clientId, { priceCents: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Starting bid cents</span>
                  <input
                    min={0}
                    step={1}
                    type="number"
                    value={item.startingBidCents ?? ""}
                    onChange={(event) =>
                      updateItem(item.clientId, { startingBidCents: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Auction end</span>
                  <input
                    type="datetime-local"
                    value={item.endAtUtc ?? ""}
                    onChange={(event) =>
                      updateItem(item.clientId, { endAtUtc: event.currentTarget.value })
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

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-950">Media assignments</h3>
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
          <div className="space-y-3">
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
            {media.map((entry) => {
              const kind = getBulkListingMediaKind({
                name: entry.file.name,
                type: entry.file.type
              });
              const fileIssues = getFileIssues(entry.id);
              const assignedItemId = getAssignedItemId(entry.id);

              return (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-md border border-zinc-200 p-3 text-sm md:grid-cols-[minmax(0,1fr)_12rem_auto]"
                >
                  <div className="min-w-0">
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
                    </div>
                    <p className="text-xs text-zinc-500">{formatBytes(entry.file.size)}</p>
                    {fileIssues.length > 0 ? (
                      <p className="mt-2 text-xs text-red-700">{issueText(fileIssues)}</p>
                    ) : null}
                  </div>
                  <select
                    value={getAssignedItemId(entry.id)}
                    onChange={(event) => assignMedia(entry.id, event.currentTarget.value)}
                  >
                    <option value="">Unassigned</option>
                    {items.map((item, index) => (
                      <option key={item.clientId} value={item.clientId}>
                        {item.sku || item.title || `Item ${index + 1}`}
                      </option>
                    ))}
                  </select>
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

      <section className="surface-card space-y-4 p-5">
        <div>
          <h3 className="text-lg font-semibold text-zinc-950">Draft creation summary</h3>
          <p className="text-sm text-zinc-600">
            Draft creation is blocked while hard validation errors remain.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="metric-card">
            <span className="meta-label">Draft rows</span>
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
          <p className="notice notice-success">Batch is ready to create as draft listings.</p>
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
            disabled={isSubmitting || isOverRequestCap || validation.hasErrors}
            onClick={() => void submitBatch()}
            type="button"
          >
            {isSubmitting ? "Creating drafts..." : "Create draft listings"}
          </button>
        </div>
      </section>
    </div>
  );
}
