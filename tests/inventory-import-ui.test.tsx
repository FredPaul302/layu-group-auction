import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InventoryImport } from "../src/components/admin/inventory-import.js";

const action = async () => ({ error: null });

describe("purchase order import preview", () => {
  it("previews purchase cost from dollars and keeps receipt a separate step", () => {
    const html = renderToStaticMarkup(<InventoryImport action={action} initialCsv={'sku,title,quantity,unit_cost,location\nSKU-1,"Lamp, blue",2,12.50,Shelf A'} />);
    expect(html).toContain("Review before saving");
    expect(html).toContain("2 units");
    expect(html).toContain("$25.00");
    expect(html).toContain("Lamp, blue");
    expect(html).toContain("Save purchase order draft");
    expect(html).toContain("Stock changes only after you receive the saved order.");
    expect(html).not.toContain("Receive all");
  });

  it("shows invalid data instead of offering to save a malformed order", () => {
    const html = renderToStaticMarkup(<InventoryImport action={action} initialCsv={"sku,title,quantity,unit_cost\nSKU-1,Lamp,1,12.345"} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("two decimal places");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/u);
    expect(html).not.toContain("Review before saving");
  });
});
