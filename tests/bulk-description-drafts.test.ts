import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canApplyBulkDescriptionDraft,
  getBulkDescriptionDraftChanges,
  getBulkDescriptionPhotoIds,
  getBulkDescriptionSourceKey,
  runBulkDescriptionQueue,
  selectBulkDescriptionItems,
  type BulkDescriptionDraft,
  type BulkDescriptionJob
} from "../src/lib/catalog/bulk-description-drafts";
import type { BulkListingItemInput } from "../src/lib/catalog/bulk-listings";

function item(clientId: string, overrides: Partial<BulkListingItemInput> = {}): BulkListingItemInput {
  return {
    clientId, title: "", categorySlug: "collectibles", condition: "", description: "", sku: "",
    listingType: "auction", imageFileIds: [`${clientId}.jpg`], videoFileIds: [], ...overrides
  };
}

function readyDraft(row: BulkListingItemInput, overrides: Partial<BulkDescriptionDraft> = {}): BulkDescriptionDraft {
  return { sourceKey: getBulkDescriptionSourceKey(row), status: "ready", title: "Blue ceramic vase", description: "A blue ceramic vase.", conditionNote: "Estimated visual condition: surface wear.", message: "Ready", ...overrides };
}

function draftResponse(description: string, title = "Photo title") {
  return Response.json({ status: "description_draft_ready", title, description, conditionNote: "Estimated visual condition: surface wear." });
}

function job(clientId: string): BulkDescriptionJob {
  return {
    clientId, sourceKey: `snapshot-${clientId}`,
    files: [new File(["original image"], `${clientId}.jpg`, { type: "image/jpeg" })],
    input: { title: "", category: "Collectibles", conditionNote: "", description: "" }
  };
}

function queueHarness() {
  const controller = new AbortController();
  const states: Record<string, BulkDescriptionDraft> = {};
  const prepare = vi.fn(async () => ["data:image/jpeg;base64,Y29tcHJlc3NlZA=="]);
  const onProgress = vi.fn();
  return {
    controller, states, prepare, onProgress,
    signal: controller.signal,
    onUpdate: (clientId: string, draft: BulkDescriptionDraft) => { states[clientId] = draft; }
  };
}

afterEach(() => { vi.useRealTimers(); });

describe("bulk photo description selection and review", () => {
  it("uses the primary photo first and respects order while excluding unassigned or duplicate photos", () => {
    const row = item("one", {
      imageFileIds: ["a", "b", "c", "d"],
      imageOrder: ["d", "missing", "c", "d", "b", "a"],
      primaryImageFileId: "b"
    });
    expect(getBulkDescriptionPhotoIds(row)).toEqual(["b", "d", "c"]);
    expect(getBulkDescriptionPhotoIds(row, true)).toEqual(["b"]);
  });

  it("accepts photo-only rows and skips written descriptions, videos, and completed previews", () => {
    const rows = [
      item("photo-only"), item("written", { description: "Existing description" }),
      item("video-only", { imageFileIds: [], videoFileIds: ["video.mov"] }),
      item("ready"), item("discarded"), item("retry"), item("changed", { title: "New title" })
    ];
    const drafts: Record<string, BulkDescriptionDraft> = {
      ready: readyDraft(rows[3]), discarded: readyDraft(rows[4], { status: "discarded" }),
      retry: readyDraft(rows[5], { status: "error" }), changed: readyDraft(item("changed"))
    };
    expect(selectBulkDescriptionItems(rows, drafts).map((row) => row.clientId)).toEqual(["photo-only", "retry", "changed"]);
  });

  it("limits a single run to 100 items", () => {
    expect(selectBulkDescriptionItems(Array.from({ length: 101 }, (_, index) => item(String(index))), {})).toHaveLength(100);
  });

  it("reselects stopped, failed, and stale previews while skipping current previews", () => {
    const rows = [item("ready"), item("stopped"), item("failed"), item("stale")];
    const options = { saleContext: "Sale context", firstImageOnly: true };
    const drafts: Record<string, BulkDescriptionDraft> = {
      ready: { ...readyDraft(rows[0]), sourceKey: getBulkDescriptionSourceKey(rows[0], options) },
      stopped: { ...readyDraft(rows[1]), status: "stopped" },
      failed: { ...readyDraft(rows[2]), status: "error" },
      stale: readyDraft(rows[3])
    };
    expect(selectBulkDescriptionItems(rows, drafts, options).map((row) => row.clientId)).toEqual(["stopped", "failed", "stale"]);
  });

  it.each([
    { title: "Changed title" }, { categorySlug: "electronics" }, { condition: "Broken base" },
    { description: "Manual edit" }, { imageFileIds: ["replacement.jpg"] },
    { primaryImageFileId: "different.jpg" }, { imageOrder: ["different.jpg"] }, { clientId: "recreated-row" }
  ])("prevents a preview from replacing a row after its source changes: %j", (updates) => {
    const row = item("one");
    const draft = readyDraft(row);
    expect(canApplyBulkDescriptionDraft(row, draft)).toBe(true);
    expect(canApplyBulkDescriptionDraft({ ...row, ...updates }, draft)).toBe(false);
    expect(getBulkDescriptionDraftChanges({ ...row, ...updates }, draft)).toBeNull();
    expect(canApplyBulkDescriptionDraft(row, { ...draft, status: "discarded" })).toBe(false);
  });

  it("returns both reviewed fields together while leaving the original item and manual SKU unchanged", () => {
    const row = item("one", { title: "Original title", description: "Original description", sku: "MANUAL-42" });
    const draft = readyDraft(row);
    const changes = getBulkDescriptionDraftChanges(row, draft);
    expect(changes).toEqual({ title: "Blue ceramic vase", description: "A blue ceramic vase.", condition: "Estimated visual condition: surface wear." });
    expect({ ...row, ...changes }).toMatchObject({ ...changes, sku: "MANUAL-42" });
    expect(row).toMatchObject({ title: "Original title", description: "Original description", sku: "MANUAL-42" });
    expect(getBulkDescriptionDraftChanges(row, { ...draft, status: "discarded" })).toBeNull();
  });

  it.each([
    { title: undefined }, { title: "" }, { title: "ab" }, { title: "a".repeat(201) },
    { description: undefined }, { description: " " }, { description: "a".repeat(3001) },
    { conditionNote: undefined }, { conditionNote: "a".repeat(2001) }
  ])("rejects incomplete or oversized preview fields: %j", (updates) => {
    const row = item("one");
    expect(getBulkDescriptionDraftChanges(row, readyDraft(row, updates))).toBeNull();
  });
});

describe("bulk photo description queue", () => {
  it("revises a written description without photos and only changes that description when applied", async () => {
    const row = item("written", { title: "Table", description: "A wooden table with a scratched top. Missing one handle.", condition: "Scratched top; missing handle", priceCents: "2500", imageFileIds: [] });
    const harness = queueHarness();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(draftResponse("Wooden table. Scratched top; missing one handle.", "Unwanted title change"));
    const instructions = "Make it two short sentences, keeping both defects.";
    await runBulkDescriptionQueue({ ...harness, fetchImpl, jobs: [{ clientId: row.clientId, sourceKey: getBulkDescriptionSourceKey(row), files: [],
      input: { title: row.title, description: row.description, conditionNote: row.condition!, category: "Furniture", revisionInstructions: instructions, includePriceSuggestion: false } }] });
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toMatchObject({ revisionInstructions: instructions });
    const draft = harness.states.written;
    expect(draft).toMatchObject({ status: "ready", descriptionOnly: true });
    expect(getBulkDescriptionDraftChanges(row, draft)).toEqual({ description: "Wooden table. Scratched top; missing one handle." });
    expect({ ...row, ...getBulkDescriptionDraftChanges(row, draft) }).toMatchObject({ title: row.title, condition: row.condition, priceCents: "2500" });
    expect(getBulkDescriptionDraftChanges({ ...row, description: "Manual edit after generation" }, draft)).toBeNull();
  });
  it("prepares and requests one item at a time, mapping responses to the correct client IDs", async () => {
    const harness = queueHarness();
    let finishFirst!: (response: Response) => void;
    let startedFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => { startedFirst = resolve; });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => {
        startedFirst();
        return new Promise((resolve) => { finishFirst = resolve; });
      })
      .mockResolvedValueOnce(draftResponse("Second item.", "Second title"));
    const jobs = [job("first"), job("second")];
    const running = runBulkDescriptionQueue({ ...harness, jobs, fetchImpl });
    await firstStarted;
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.states.second).toBeUndefined();
    finishFirst(draftResponse("First item.", "First title"));
    expect(await running).toMatchObject({ completed: 2, failed: 0, stopped: false });
    expect(harness.prepare).toHaveBeenCalledTimes(2);
    expect(harness.states.first).toMatchObject({ status: "ready", sourceKey: "snapshot-first", title: "First title", description: "First item." });
    expect(harness.states.second).toMatchObject({ status: "ready", sourceKey: "snapshot-second", title: "Second title", description: "Second item." });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/admin/listings/description-draft");
    expect(JSON.parse(options!.body as string)).toEqual({
      title: "", category: "Collectibles", conditionNote: "", description: "",
      images: ["data:image/jpeg;base64,Y29tcHJlc3NlZA=="]
    });
    expect(jobs[0].input.description).toBe("");
    expect(jobs[0].input.title).toBe("");
    expect(await jobs[0].files[0].text()).toBe("original image");
  });

  it("keeps successful previews and continues after a recoverable item failure without retrying it", async () => {
    const harness = queueHarness();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(draftResponse("First preview."))
      .mockResolvedValueOnce(Response.json({ message: "Unable to identify this image." }, { status: 422 }))
      .mockResolvedValueOnce(draftResponse("Third preview."));
    const result = await runBulkDescriptionQueue({ ...harness, jobs: [job("one"), job("two"), job("three")], fetchImpl });
    expect(result).toMatchObject({ completed: 3, failed: 1, stopped: false });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(harness.states.one.status).toBe("ready");
    expect(harness.states.two).toMatchObject({ status: "error", message: "Unable to identify this image." });
    expect(harness.states.three.status).toBe("ready");
  });

  it.each([
    [401, "unauthorized"], [403, "forbidden"], [429, "description_rate_limited"],
    [503, "description_ai_disabled"]
  ])("stops the queue immediately for HTTP %s / %s", async (status, code) => {
    const harness = queueHarness();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: code, message: "Drafting is unavailable." }, { status: Number(status) }));
    const result = await runBulkDescriptionQueue({ ...harness, jobs: [job("one"), job("two")], fetchImpl });
    expect(result).toMatchObject({ completed: 1, failed: 1, stopped: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.states.one.status).toBe("error");
    expect(harness.states.two.status).toBe("stopped");
  });

  it("stops on a redirected sign-in response", async () => {
    const harness = queueHarness();
    const response = Response.json({});
    Object.defineProperty(response, "redirected", { value: true });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await runBulkDescriptionQueue({ ...harness, jobs: [job("one"), job("two")], fetchImpl });
    expect(result.stopped).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retains an earlier preview when stopped and never records a late response or starts remaining items", async () => {
    const harness = queueHarness();
    let finishSecond!: (response: Response) => void;
    let startedSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => { startedSecond = resolve; });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(draftResponse("Completed preview."))
      .mockImplementationOnce(() => {
        startedSecond();
        return new Promise((resolve) => { finishSecond = resolve; });
      });
    const running = runBulkDescriptionQueue({ ...harness, jobs: [job("one"), job("two"), job("three")], fetchImpl });
    await secondStarted;
    harness.controller.abort();
    finishSecond(draftResponse("This result arrived after stopping."));
    expect(await running).toMatchObject({ completed: 1, failed: 0, stopped: true });
    expect(harness.states.one).toMatchObject({ status: "ready", description: "Completed preview." });
    expect(harness.states.two).toMatchObject({ status: "stopped" });
    expect(harness.states.two.description).toBeUndefined();
    expect(harness.states.two.title).toBeUndefined();
    expect(harness.states.three.status).toBe("stopped");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends no requests when already aborted", async () => {
    const harness = queueHarness();
    harness.controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await runBulkDescriptionQueue({ ...harness, jobs: [job("one")], fetchImpl })).toMatchObject({ completed: 0, stopped: true });
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("loads saved originals only for the active item and leaves later originals unloaded on stop", async () => {
    const harness = queueHarness();
    const loadFirst = vi.fn().mockResolvedValue(job("first").files);
    const loadSecond = vi.fn().mockResolvedValue(job("second").files);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      harness.controller.abort();
      return draftResponse("Stopped response");
    });
    await runBulkDescriptionQueue({ ...harness, fetchImpl, jobs: [
      { ...job("first"), files: [], loadFiles: loadFirst },
      { ...job("second"), files: [], loadFiles: loadSecond }
    ] });
    expect(loadFirst).toHaveBeenCalledOnce();
    expect(loadSecond).not.toHaveBeenCalled();
    expect(harness.prepare).toHaveBeenCalledOnce();
  });

  it("reports photo preparation failures on the correct item and continues without sending that original", async () => {
    const harness = queueHarness();
    harness.prepare.mockRejectedValueOnce(new Error("Photo exceeds the size limit."));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(draftResponse("Second preview."));
    await runBulkDescriptionQueue({ ...harness, jobs: [job("one"), job("two")], fetchImpl });
    expect(harness.states.one).toMatchObject({ status: "error", message: "Photo exceeds the size limit." });
    expect(harness.states.two.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { description: "Missing title." },
    { title: "ab", description: "A description." },
    { title: "a".repeat(201), description: "A description." },
    { title: "A valid title", description: "a".repeat(3001) },
    { title: "A valid title", description: "A description.", status: "unexpected" }
  ])("does not expose a malformed response as an applicable draft: %j", async (payload) => {
    const harness = queueHarness();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "description_draft_ready", ...payload }));
    expect(await runBulkDescriptionQueue({ ...harness, jobs: [job("one")], fetchImpl })).toMatchObject({ completed: 1, failed: 1, stopped: false });
    expect(harness.states.one.status).toBe("error");
    expect(harness.states.one.title).toBeUndefined();
    expect(harness.states.one.description).toBeUndefined();
  });
});
