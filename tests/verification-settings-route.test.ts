import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setting: { findUnique: vi.fn(), update: vi.fn() }
}));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { siteSetting: mocks.setting } }));

import { POST } from "../src/app/api/admin/settings/verification/route";
import { getVerificationPolicy } from "../src/lib/verification/policy-service";

function request(level = "1", limit = "99.95", origin = "http://localhost:3000") {
  const form = new FormData();
  form.set("verificationLevel", level);
  form.set("emailOnlyLimit", limit);
  return new NextRequest("http://localhost:3000/api/admin/settings/verification", {
    method: "POST", headers: { origin }, body: form
  });
}

describe("verification settings admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "admin_1", role: "admin" });
    mocks.setting.update.mockResolvedValue({});
  });

  it("saves the chosen level and exact integer cents", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/admin/settings/verification?status=saved");
    expect(mocks.setting.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { launchAccessEnabled: false, verificationLevel: 1, emailOnlyLimitCents: 9995 } });
  });

  it("rejects a foreign origin before checking the session or writing settings", async () => {
    expect((await POST(request("1", "100", "https://foreign.example"))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.setting.update).not.toHaveBeenCalled();
  });

  it.each([null, { id: "buyer_1", role: "bidder" }])("denies unauthorized settings changes", async (subject) => {
    mocks.auth.mockResolvedValue(subject);
    expect((await POST(request())).status).toBe(303);
    expect(mocks.setting.update).not.toHaveBeenCalled();
  });

  it.each([["4", "100"], ["1", "0"], ["2", "1.234"], ["3", "100x"], ["1", "1000001"]])("rejects malformed or out-of-range settings (%s, %s)", async (level, limit) => {
    const response = await POST(request(level, limit));
    expect(response.headers.get("location")).toContain("?error=");
    expect(mocks.setting.update).not.toHaveBeenCalled();
  });

  it("reads persisted settings without a process cache so raising protection takes effect", async () => {
    mocks.setting.findUnique.mockResolvedValueOnce({ verificationLevel: 1, emailOnlyLimitCents: 10000 })
      .mockResolvedValueOnce({ verificationLevel: 3, emailOnlyLimitCents: 10000 });
    expect((await getVerificationPolicy()).verificationLevel).toBe(1);
    expect((await getVerificationPolicy()).verificationLevel).toBe(3);
  });

  it("saves custom tier amounts and the launch limit in exact cents", async () => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ verificationLevel: "3", emailOnlyLimit: "100.00", launchAccessEnabled: "on", depositTier1: "2.50", depositTier2: "25.50", launchAuctionLimit: "50.50" })) form.set(name, value);
    const response = await POST(new NextRequest("http://localhost:3000/api/admin/settings/verification", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form }));
    expect(response.headers.get("location")).toContain("status=saved");
    expect(mocks.setting.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { verificationLevel: 3, emailOnlyLimitCents: 10000, launchAccessEnabled: true, depositTier1Cents: 250, depositTier2Cents: 2550, launchAuctionLimitCents: 5050 } });
  });

  it.each([["2.501", "25.50", "50.00"], ["2.50", "2.50", "50.00"], ["0", "20", "40"], ["1", "20", "40.001"], ["1", "", "40"]])("rejects invalid tier edits atomically (%s, %s, %s)", async (first, second, limit) => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ verificationLevel: "3", emailOnlyLimit: "100.00", depositTier1: first, depositTier2: second, launchAuctionLimit: limit })) form.set(name, value);
    const response = await POST(new NextRequest("http://localhost:3000/api/admin/settings/verification", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form }));
    expect(response.headers.get("location")).toContain("error=");
    expect(mocks.setting.update).not.toHaveBeenCalled();
  });
});
