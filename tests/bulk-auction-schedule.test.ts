import { describe, expect, it } from "vitest";
import { applySharedAuctionEnd, auctionEndAfter, auctionEndToLocalInput, localAuctionEndToUtc } from "../src/lib/catalog/bulk-auction-schedule";
import { appendBulkListingMedia, parseBulkListingCsv, type BulkListingItemInput } from "../src/lib/catalog/bulk-listings";

const now = new Date("2026-09-15T16:30:00Z");
const row: BulkListingItemInput = { clientId: "one", sku: "", title: "Vase", description: "Chipped rim", categorySlug: "collectibles", listingType: "auction", imageFileIds: [], videoFileIds: [], endAtUtc: "2026-09-20T12:00:00Z" };

describe("shared auction closing time", () => {
  it("defaults to a full ten days and supports custom hours, minutes and fractional days", () => {
    expect(auctionEndAfter("10", "days", now)).toBe("2026-09-25T16:30:00.000Z");
    expect(auctionEndAfter("2.5", "hours", now)).toBe("2026-09-15T19:00:00.000Z");
    expect(auctionEndAfter("35", "minutes", now)).toBe("2026-09-15T17:05:00.000Z");
    expect(auctionEndAfter("0.5", "days", now)).toBe("2026-09-16T04:30:00.000Z");
  });
  it.each(["", " ", "0", "-1", "NaN", "Infinity", "1e99", "0.00001"])("rejects unusable durations: %s", (value) => {
    expect(auctionEndAfter(value, "days", now)).toBeNull();
  });
  it("shows a local time and returns the same absolute UTC instant on submission", () => {
    const utc = "2026-09-25T16:30:00.000Z";
    expect(localAuctionEndToUtc(auctionEndToLocalInput(utc))).toBe(utc);
    expect(localAuctionEndToUtc("2026-02-30T10:00")).toBeNull();
    expect(localAuctionEndToUtc("not a time")).toBeNull();
    expect(auctionEndToLocalInput("")).toBe("");
  });
  it("uses the same time for every auction including combined listings, preserving fixed-price rows and original values", () => {
    const end = auctionEndAfter("10", "days", now)!;
    const rows = [row, { ...row, clientId: "combined", priceCents: "5000" }, { ...row, clientId: "fixed", listingType: "fixed_price" as const }];
    const scheduled = applySharedAuctionEnd(rows, true, end);
    expect(scheduled.slice(0, 2).map((item) => item.endAtUtc)).toEqual([end, end]);
    expect(scheduled[2]).toBe(rows[2]);
    expect(rows[0].endAtUtc).toBe("2026-09-20T12:00:00Z");
    expect(applySharedAuctionEnd(rows, false, end)).toBe(rows);
  });
  it("applies the selected time to CSV imports and rows added after the time was chosen", () => {
    const end = auctionEndAfter("10", "days", now)!;
    const imported = parseBulkListingCsv("title,description,categorySlug,listingType,endAtUtc\nLamp,Used,collectibles,auction,2026-09-17T12:00:00Z\nBowl,Used,collectibles,auction,");
    const scheduled = applySharedAuctionEnd([...imported.items, { ...row, clientId: "added-later" }], true, end);
    expect(scheduled).toHaveLength(3);
    expect(scheduled.every((item) => item.endAtUtc === end)).toBe(true);
  });

  it("preserves existing manual photo assignments, order and cover when later uploads are auto-matched", () => {
    const first = { ...row, mediaPrefix: "TABLE", imageFileIds: ["manual-a", "manual-b"], imageOrder: ["manual-b", "manual-a"], primaryImageFileId: "manual-b" };
    const second = { ...row, clientId: "two", mediaPrefix: "BOWL" };
    const updated = appendBulkListingMedia([first, second], [
      { id: "new-table", name: "TABLE-3.jpg", type: "image/jpeg", size: 100 },
      { id: "new-bowl", name: "BOWL-1.jpg", type: "image/jpeg", size: 100 },
      { id: "manual-a", name: "BOWL-manual.jpg", type: "image/jpeg", size: 100 }
    ]);
    expect(updated[0]).toMatchObject({ imageFileIds: ["manual-a", "manual-b", "new-table"], imageOrder: ["manual-b", "manual-a", "new-table"], primaryImageFileId: "manual-b" });
    expect(updated[1]).toMatchObject({ imageFileIds: ["new-bowl"], primaryImageFileId: "new-bowl" });
    expect(first.imageFileIds).toEqual(["manual-a", "manual-b"]);
  });
});
