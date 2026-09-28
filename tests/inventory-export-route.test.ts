import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getCurrentUserFromCookieSource: vi.fn() }));
const serviceMocks = vi.hoisted(() => ({ listInventory: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/inventory/service", () => serviceMocks);

import { GET } from "../src/app/api/admin/inventory/export/route.js";

describe("inventory CSV export", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    { user: null, destination: "/auth/login" },
    { user: { id: "bidder_1", role: "bidder" }, destination: "/account" }
  ])("prevents inventory reads for an unauthorized request", async ({ user, destination }) => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    const response = await GET(new NextRequest("https://market.example/api/admin/inventory/export"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://market.example${destination}`);
    expect(serviceMocks.listInventory).not.toHaveBeenCalled();
  });

  it("exports only the signed-in seller's search results with private download headers and spreadsheet-safe cells", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({ id: "admin_1", role: "admin" });
    serviceMocks.listInventory.mockResolvedValue([{ sku: "=SUM(1)", title: 'Lamp, "blue"', location: "Shelf A", quantity: 2, unitCostCents: 1250, allocations: [] }]);
    const response = await GET(new NextRequest("https://market.example/api/admin/inventory/export?q=%20Lamp%20&sellerUserId=other"));
    expect(serviceMocks.listInventory).toHaveBeenCalledWith("admin_1", "Lamp");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    const text = await response.text();
    expect(text).toContain('"\'=SUM(1)"');
    expect(text).toContain('"Lamp, ""blue"""');
    expect(text).toContain('"12.50"');
  });
});
