import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents, formatMoney, moneyFormValue } from "../src/lib/money";
import { parseMoneyFormInput } from "../src/lib/catalog";
import { parseBulkListingCsv } from "../src/lib/catalog/bulk-listings";
import { MoneyInput } from "../src/components/admin/money-input";

describe("dollar entry with exact cent storage", () => {
  it.each([["0.01", 1], ["12.50", 1250], ["1.01", 101], ["19.99", 1999],
    ["0.29", 29], ["1", 100], [".50", 50], ["12.", 1200], [" 20.00 ", 2000], ["21474836.47", 2147483647]])(
    "converts %s without floating-point rounding", (dollars, cents) => {
      expect(dollarsToCents(dollars)).toBe(cents);
      expect(dollarsToCents(centsToDollars(cents))).toBe(cents);
    });
  it.each(["", " ", "1.234", "1e2", "-1", "+2", "12junk", "Infinity", "21474836.48", "999999999999999999", null, 12.5])(
    "rejects malformed or out-of-range amount %s", (value) => expect(dollarsToCents(value)).toBeNaN());

  it("preserves old cent forms and uses explicitly named dollars without guessing", () => {
    const form = new FormData();
    form.set("amountCents", "1250");
    expect(moneyFormValue(form, "amount", "amountCents")).toBe(1250);
    form.set("amount", "20.01");
    expect(moneyFormValue(form, "amount", "amountCents")).toBe(2001);
    form.set("amount", "bad");
    expect(moneyFormValue(form, "amount", "amountCents")).toBeNaN();
  });

  it("validates optional prices, zero shipping and minimum increments", () => {
    const form = new FormData();
    expect(parseMoneyFormInput(form, "fixedPrice", "Price", { required: false })).toBeNull();
    form.set("shippingFee", "0.00");
    expect(parseMoneyFormInput(form, "shippingFee", "Shipping")).toBe(0);
    form.set("minimumBidIncrement", "0.00");
    expect(() => parseMoneyFormInput(form, "minimumBidIncrement", "Increment", { minimum: 1 })).toThrow("$0.01");
    form.set("fixedPrice", "10.001");
    expect(() => parseMoneyFormInput(form, "fixedPrice", "Price", { required: false })).toThrow("two decimal places");
  });

  it("shows stored and AI-suggested prices in dollars, including resumed invalid edits", () => {
    expect(formatMoney(1250)).toBe("$12.50");
    expect(renderToStaticMarkup(<MoneyInput valueCents="1250" onChangeCents={() => {}} />)).toContain('value="12.50"');
    const invalid = renderToStaticMarkup(<MoneyInput valueCents="dollars:12.345" onChangeCents={() => {}} />);
    expect(invalid).toContain('value="12.345"');
    expect(invalid).toContain('aria-invalid="true"');
  });

  it("imports dollar CSVs while preserving explicitly marked older cent CSVs", () => {
    const base = "title,description,listingType,categorySlug,";
    const row = "Lamp,Used,fixed_price,home,";
    expect(parseBulkListingCsv(`${base}price\n${row}12.50`).items[0].priceCents).toBe("1250");
    expect(parseBulkListingCsv(`${base}priceCents\n${row}1250`).items[0].priceCents).toBe("1250");
    expect(parseBulkListingCsv(`${base}price,priceCents\n${row}12.50,1250`).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "csv_price_units_ambiguous", severity: "error" })]));
    expect(parseBulkListingCsv(`${base}price\n${row}12.501`).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "csv_price_invalid", severity: "error" })]));
  });
});
