import { describe, expect, it } from "vitest";
import {
  csvCell, exportInventoryCsv, getAllocationReturn, getInventorySummary,
  inventoryCsvTemplate, nextInventoryBalance, parseInventoryCsv, parseInventoryMoney,
  parseInventoryQuantity, weightedInventoryCost
} from "../src/lib/inventory/rules";

const allocation = (status: string, overrides = {}) => ({
  unitCostCents: 1200, sellingCostCents: 300,
  listing: { orders: [{ status, totalCents: 2600, paidAtUtc: null, ...overrides }] }
});

describe("inventory import and money rules", () => {
  it("parses the downloadable template with integer cents", () => {
    expect(parseInventoryCsv(inventoryCsvTemplate)).toEqual([{ sku: "EXAMPLE-001", title: "Example item", quantity: 1, unitCostCents: 1250, location: "Shelf A" }]);
  });
  it("supports BOM, CRLF, reordered headers, quoted commas and escaped quotes", () => {
    expect(parseInventoryCsv('\uFEFFtitle,unit_cost,sku,quantity\r\n"Game, ""Deluxe""",0.29,game-1,2\r\n')[0]).toMatchObject({ title: 'Game, "Deluxe"', unitCostCents: 29, sku: "GAME-1", location: null });
  });
  it.each([
    "sku,title,quantity,cost\nx,Item,1,2", "sku,title,quantity,unit_cost,sku\nx,Item,1,2,x",
    "sku,title,quantity,unit_cost\nx,Item,1,2,extra", 'sku,title,quantity,unit_cost\nx,"Unclosed,1,2',
    'sku,title,quantity,unit_cost\nx,"Quote"bad,1,2', "sku,title,quantity,unit_cost\nx,Item,1,2\nX,Item,1,2",
    "sku,title,quantity,unit_cost\nx,Item,-1,2", "sku,title,quantity,unit_cost\nx,Item,1,2.001",
    "sku,title,quantity,unit_cost\n", "x".repeat(100001)
  ])("rejects malformed, duplicate or oversized imports", (csv) => {
    expect(() => parseInventoryCsv(csv)).toThrow();
  });
  it.each(["NaN", "Infinity", "1e3", "2.001", "-1", "21474836.48", "1,000", ""])('rejects invalid money %s', (value) => {
    expect(() => parseInventoryMoney(value)).toThrow();
  });
  it("avoids floating point rounding errors in dollar parsing", () => {
    expect(parseInventoryMoney("0.29")).toBe(29);
    expect(parseInventoryMoney("12.5")).toBe(1250);
    expect(parseInventoryMoney("21474836.47")).toBe(2147483647);
  });
  it("rejects purchase-order totals beyond precise integer accounting", () => {
    const csv = "sku,title,quantity,unit_cost\n" + Array.from({ length: 5 }, (_, index) => `SKU-${index},Item,1000000,21474836.47`).join("\n");
    expect(() => parseInventoryCsv(csv)).toThrow(/purchase-order total/u);
  });
  it.each(["0", "1.5", "-1", "1000001", "1e2"])("rejects invalid received quantity %s", (value) => {
    expect(() => parseInventoryQuantity(value)).toThrow();
  });
  it("requires integral nonzero adjustments and preserves committed units", () => {
    expect(parseInventoryQuantity("-2", true)).toBe(-2);
    expect(nextInventoryBalance({ quantity: 5, allocated: 3, quantityDelta: -2 })).toBe(3);
    expect(() => nextInventoryBalance({ quantity: 5, allocated: 3, quantityDelta: -3 })).toThrow(/assigned/u);
    expect(() => nextInventoryBalance({ quantity: 0, allocated: 0, quantityDelta: -1 })).toThrow();
  });
  it("weights only unallocated stock when receiving a different acquisition cost", () => {
    expect(weightedInventoryCost({ available: 3, unitCostCents: 1000, incomingQuantity: 1, incomingUnitCostCents: 2000 })).toBe(1250);
    expect(weightedInventoryCost({ available: 0, unitCostCents: 1000, incomingQuantity: 1, incomingUnitCostCents: 2000 })).toBe(2000);
  });
});

describe("inventory lifecycle and per-item return", () => {
  it("does not count an unpaid or cancelled order as sale revenue", () => {
    expect(getAllocationReturn(allocation("awaiting_payment"))).toMatchObject({ sold: false, revenueCents: null, contributionCents: null });
    expect(getAllocationReturn(allocation("cancelled"))).toMatchObject({ sold: false });
  });
  it("uses recorded payment and costs even after an order is archived", () => {
    expect(getAllocationReturn(allocation("archived", { paidAtUtc: new Date(), fulfilledAtUtc: new Date() }))).toEqual({ sold: true, fulfilled: true, revenueCents: 2600, contributionCents: 1100 });
  });
  it("shows losses rather than clamping contribution to zero", () => {
    expect(getAllocationReturn(allocation("paid", { totalCents: 1000 })).contributionCents).toBe(-500);
  });
  it("keeps sold stock on hand until fulfillment and prevents its reuse", () => {
    expect(getInventorySummary({ quantity: 5, unitCostCents: 1000, allocations: [allocation("awaiting_payment"), allocation("paid"), allocation("fulfilled")] })).toEqual({
      available: 2, allocated: 3, sold: 2, fulfilled: 1, onHand: 4, stockCostCents: 4400
    });
  });
  it("escapes spreadsheet formulas and quotes in exported data", () => {
    expect(csvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(csvCell('"Quoted"')).toBe('"""Quoted"""');
    expect(exportInventoryCsv([{ sku: "+BAD", title: "Item", location: null, quantity: 1, unitCostCents: 29, allocations: [] }])).toContain('"\'+BAD","Item","","1","1","0","0","0","0.29","0.29"');
  });
});
