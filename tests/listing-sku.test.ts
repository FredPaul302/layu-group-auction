import { describe, expect, it } from "vitest";
import { normalizeListingSku, rethrowListingSkuError } from "../src/lib/catalog/sku.js";

describe("listing SKU input", () => {
  it("leaves empty values for automatic assignment and retains six-digit numbers as text", () => {
    expect(normalizeListingSku(" ")).toBeNull();
    expect(normalizeListingSku(undefined)).toBeNull();
    expect(normalizeListingSku("1")).toBe("000001");
    expect(normalizeListingSku("000001")).toBe("000001");
    expect(normalizeListingSku("999999")).toBe("999999");
    expect(normalizeListingSku(" lamp-a ")).toBe("LAMP-A");
  });
  it("rejects excessive length and embedded control characters", () => {
    expect(() => normalizeListingSku("x".repeat(81))).toThrow();
    expect(() => normalizeListingSku("A\nB")).toThrow();
    expect(() => normalizeListingSku("A\u2028B")).toThrow();
    expect(() => normalizeListingSku("A\u0085B")).toThrow();
  });
  it("reports duplicate SKUs without disguising unrelated database failures", () => {
    expect(() => rethrowListingSkuError({ code: "P2002", meta: { target: ["seller_user_id", "sku"] } })).toThrow("That SKU is already assigned");
    const slugError = { code: "P2002", meta: { target: ["slug"] } };
    try { rethrowListingSkuError(slugError); } catch (error) { expect(error).toBe(slugError); }
  });
});
