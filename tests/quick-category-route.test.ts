import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  origin: vi.fn(),
  createCategory: vi.fn()
}));

vi.mock("@/app/api/_utils/origin", () => ({ requireSameOriginRequest: mocks.origin }));
vi.mock("@/app/api/_utils/require-admin-request-user", () => ({ requireAdminRequestUser: mocks.admin }));
vi.mock("@/lib/catalog/service", () => ({ createCategoryFromFormData: mocks.createCategory }));

import { POST } from "../src/app/api/admin/categories/route.js";

function request(body: unknown = {
  name: "Furniture",
  slug: "furniture",
  description: "",
  minimumStartBid: "5.00",
  minimumBidIncrement: "1.00",
  requiredBidTier: "tier_1"
}) {
  return new NextRequest("http://localhost:3000/api/admin/categories", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("inline category creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin.mockReturnValue(null);
    mocks.admin.mockResolvedValue({ response: null, user: { id: "admin_1", role: "admin" } });
    mocks.createCategory.mockImplementation(async (form: FormData) => ({
      id: "category_1",
      name: form.get("name"),
      slug: form.get("slug"),
      requiredBidTier: form.get("requiredBidTier"),
      minimumStartBidCents: 500,
      minimumBidIncrementCents: 100
    }));
  });

  it("creates a category through the shared domain validation path", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect((await response.json()).category).toMatchObject({ id: "category_1", slug: "furniture" });
    const form = mocks.createCategory.mock.calls[0][0] as FormData;
    expect(form.get("name")).toBe("Furniture");
    expect(form.get("minimumStartBid")).toBe("5.00");
    expect(form.get("minimumBidIncrement")).toBe("1.00");
  });

  it("rejects a bad origin before authentication or writes", async () => {
    const denied = Response.json({ message: "Forbidden" }, { status: 403 });
    mocks.origin.mockReturnValue(denied);
    expect(await POST(request())).toBe(denied);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("validates all category fields before writing", async () => {
    const response = await POST(request({ name: "Furniture" }));
    expect(response.status).toBe(422);
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });
});
