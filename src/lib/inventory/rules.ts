export class InventoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export const inventoryCsvTemplate = "sku,title,quantity,unit_cost,location\nEXAMPLE-001,Example item,1,12.50,Shelf A\n";
export const INVENTORY_MAX_CSV_BYTES = 100_000;
const MAX_CENTS = 2_147_483_647;

export function inventoryText(value: string, field: string, max: number) {
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f]/u.test(text)) {
    throw new InventoryError("invalid_input", `${field} is required and must be at most ${max} characters without control characters.`);
  }
  return text;
}

export function parseInventoryMoney(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/u.test(value.trim())) {
    throw new InventoryError("invalid_cost", "Enter a dollar amount with at most two decimal places.");
  }
  const [dollars, fraction = ""] = value.trim().split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    throw new InventoryError("invalid_cost", "The cost is too large.");
  }
  return cents;
}

export function parseInventoryQuantity(value: string, signed = false) {
  if (!(signed ? /^-?\d+$/u : /^\d+$/u).test(value.trim())) {
    throw new InventoryError("invalid_quantity", "Quantity must be a whole number.");
  }
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity === 0 || Math.abs(quantity) > 1_000_000 || (!signed && quantity < 0)) {
    throw new InventoryError("invalid_quantity", "Quantity must be nonzero and no more than 1,000,000 units.");
  }
  return quantity;
}

function csvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const text = source.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  for (let i = 0; i <= text.length; i++) {
    const char = text[i] ?? "\n";
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "," || char === "\n") {
      row.push(field);
      field = "";
      closedQuote = false;
      if (char === "\n") {
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
      }
    } else if (closedQuote || (char === '"' && field)) {
      throw new InventoryError("invalid_csv", "CSV contains a misplaced quote or text after a closing quote.");
    } else if (char === '"') {
      quoted = true;
    } else {
      field += char;
    }
  }
  if (quoted) throw new InventoryError("invalid_csv", "CSV contains an unclosed quote.");
  return rows;
}

export type InventoryCsvLine = {
  sku: string; title: string; quantity: number; unitCostCents: number; location: string | null;
};

export function parseInventoryCsv(text: string): InventoryCsvLine[] {
  if (new TextEncoder().encode(text).length > INVENTORY_MAX_CSV_BYTES) {
    throw new InventoryError("csv_too_large", "Purchase-order CSV must be 100 KB or smaller.");
  }
  const [header, ...rows] = csvRows(text);
  const columns = header?.map((cell) => cell.trim().toLowerCase()) ?? [];
  if (!["sku", "title", "quantity", "unit_cost"].every((column) => columns.includes(column)) ||
      new Set(columns).size !== columns.length ||
      columns.some((column) => !["sku", "title", "quantity", "unit_cost", "location"].includes(column))) {
    throw new InventoryError("invalid_csv_header", "Use columns sku,title,quantity,unit_cost and optional location. Unit cost is in dollars.");
  }
  if (!rows.length || rows.length > 500) {
    throw new InventoryError("invalid_csv_rows", "Include between 1 and 500 inventory rows.");
  }
  const seen = new Set<string>();
  let purchaseCostCents = 0;
  return rows.map((row, index) => {
    if (row.length !== columns.length) throw new InventoryError("invalid_csv", `Row ${index + 2} has the wrong number of columns.`);
    const get = (key: string) => row[columns.indexOf(key)]?.trim() ?? "";
    const sku = inventoryText(get("sku"), "SKU", 80).toUpperCase();
    if (seen.has(sku)) throw new InventoryError("duplicate_sku", `SKU ${sku} appears more than once. Combine its quantities first.`);
    seen.add(sku);
    const quantity = parseInventoryQuantity(get("quantity"));
    const unitCostCents = parseInventoryMoney(get("unit_cost"));
    if (!Number.isSafeInteger(quantity * unitCostCents)) throw new InventoryError("invalid_cost", "The line total is too large.");
    purchaseCostCents += quantity * unitCostCents;
    if (!Number.isSafeInteger(purchaseCostCents)) throw new InventoryError("invalid_cost", "The purchase-order total is too large.");
    return {
      sku,
      title: inventoryText(get("title"), "Title", 200),
      quantity,
      unitCostCents,
      location: get("location") ? inventoryText(get("location"), "Location", 120) : null
    };
  });
}

export function nextInventoryBalance(input: { quantity: number; allocated: number; quantityDelta: number }) {
  const next = input.quantity + input.quantityDelta;
  if (!Number.isSafeInteger(next) || next > 1_000_000 || next < input.allocated || next < 0) {
    throw new InventoryError("stock_committed", "This adjustment would remove stock assigned to listings, create negative stock, or exceed 1,000,000 units. Release eligible listings before reducing assigned stock.");
  }
  return next;
}

export function weightedInventoryCost(input: { available: number; unitCostCents: number; incomingQuantity: number; incomingUnitCostCents: number }) {
  return Math.round((input.available * input.unitCostCents + input.incomingQuantity * input.incomingUnitCostCents) / (input.available + input.incomingQuantity));
}

type InventoryOrder = { status: string; totalCents: number; paidAtUtc: Date | null; fulfilledAtUtc?: Date | null };
type ReturnAllocation = { unitCostCents: number; sellingCostCents: number; listing: { orders: InventoryOrder[] } };

export function getAllocationReturn(allocation: ReturnAllocation) {
  const order = allocation.listing.orders.find((item) => item.paidAtUtc !== null || ["paid", "ready_for_fulfillment", "fulfilled", "completed"].includes(item.status));
  const fulfilled = Boolean(order?.fulfilledAtUtc || (order && ["fulfilled", "completed"].includes(order.status)));
  return {
    sold: Boolean(order),
    fulfilled,
    revenueCents: order?.totalCents ?? null,
    contributionCents: order ? order.totalCents - allocation.unitCostCents - allocation.sellingCostCents : null
  };
}

export function getInventorySummary(item: { quantity: number; unitCostCents: number; allocations: ReturnAllocation[] }) {
  const returns = item.allocations.map(getAllocationReturn);
  const allocated = item.allocations.length;
  const sold = returns.filter((entry) => entry.sold).length;
  const fulfilled = returns.filter((entry) => entry.fulfilled).length;
  return {
    available: item.quantity - allocated,
    allocated,
    sold,
    fulfilled,
    onHand: item.quantity - fulfilled,
    stockCostCents: (item.quantity - allocated) * item.unitCostCents + item.allocations.reduce((total, allocation) => total + (getAllocationReturn(allocation).fulfilled ? 0 : allocation.unitCostCents), 0)
  };
}

export function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s]*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportInventoryCsv(items: Array<{ sku: string; title: string; location: string | null; quantity: number; unitCostCents: number; allocations: ReturnAllocation[] }>) {
  return [
    "sku,title,location,on_hand,available_to_list,assigned_to_listings,paid_units,fulfilled_units,unit_cost,stock_cost",
    ...items.map((item) => {
      const summary = getInventorySummary(item);
      return [item.sku, item.title, item.location ?? "", summary.onHand, summary.available, summary.allocated, summary.sold, summary.fulfilled, (item.unitCostCents / 100).toFixed(2), (summary.stockCostCents / 100).toFixed(2)].map(csvCell).join(",");
    })
  ].join("\r\n") + "\r\n";
}
