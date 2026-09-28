import { describe, expect, it } from "vitest";
import { parseWorkspaceSnapshot, resumableWorkspace, serializableWorkspace, type BulkWorkspaceSnapshot } from "../src/lib/catalog/bulk-workspace-draft";
const snapshot = (): BulkWorkspaceSnapshot => ({ items: Array.from({ length: 100 }, (_, i) => ({ clientId: `item-${i}`, title: i ? "" : "Half-written title", description: "", categorySlug: "", sku: "", listingType: "auction", imageFileIds: i ? [] : ["photo"], imageOrder: i ? [] : ["photo"], primaryImageFileId: i ? null : "photo", videoFileIds: [] })),
  media: [{ id: "photo", savedPhotoId: "saved-photo", file: { name: "photo.jpg", type: "image/jpeg", size: 580 * 1024 * 1024, lastModified: 123 } }],
  sharedClosing: true, sharedEndAtUtc: "2030-01-01T17:00:00.000Z", duration: "10", durationUnit: "days", editingInstructions: { "item-0": "Describe the scratch" },
  descriptionDrafts: {}, includePriceSuggestion: true, aiSaleContext: "Furniture is sturdy.", firstImageOnly: true,
  descriptionSelectionOverrides: { "item-0": false }, defaultCategorySlug: "arcade", saveAs: "draft" });
describe("unfinished bulk batch snapshots", () => {
  it("preserves 100 incomplete rows, assignments, text instructions and UTC ending with a 580 MB reference", () => {
    const input = snapshot(); expect(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });
  it("retains media metadata instead of serializing a File into an empty object", () => {
    const input = snapshot(); input.media = [{ id: "local", file: new File(["image"], "phone.jpg", { type: "image/jpeg", lastModified: 123 }) }];
    expect(serializableWorkspace(input).media[0].file).toEqual({ name: "phone.jpg", type: "image/jpeg", size: 5, lastModified: 123 });
  });
  it("continues to read earlier snapshots without AI context or selection settings", () => {
    const input = snapshot();
    delete input.aiSaleContext; delete input.firstImageOnly; delete input.descriptionSelectionOverrides; delete input.defaultCategorySlug;
    expect(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });
  it("keeps finished AI previews and stops interrupted work on resume", () => {
    const input = snapshot(); input.descriptionDrafts = { ready: { sourceKey: "a", status: "ready", message: "Preview", title: "Vase" }, waiting: { sourceKey: "b", status: "generating", message: "Working" } };
    const resumed = resumableWorkspace(parseWorkspaceSnapshot(input));
    expect(resumed.descriptionDrafts.ready).toEqual(input.descriptionDrafts.ready);
    expect(resumed.descriptionDrafts.waiting.status).toBe("stopped"); expect(input.descriptionDrafts.waiting.status).toBe("generating");
  });
  it.each(["over-count", "duplicate-id", "over-size", "malformed-row", "malformed-ai"])("rejects %s snapshots instead of saving unusable recovery data", (kind) => {
    const input = snapshot();
    if (kind === "over-count") input.items.push(input.items[0]);
    if (kind === "duplicate-id") input.items[1].clientId = input.items[0].clientId;
    if (kind === "over-size") input.media[0].file = { ...input.media[0].file, size: 1024 * 1024 * 1024 + 1 };
    if (kind === "malformed-row") Object.assign(input.items[0], { description: {} });
    if (kind === "malformed-ai") Object.assign(input.descriptionDrafts, { row: { status: "ready", description: {} } });
    expect(() => parseWorkspaceSnapshot(input)).toThrow();
  });
});
