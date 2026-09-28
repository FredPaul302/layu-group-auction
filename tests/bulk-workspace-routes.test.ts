import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), save: vi.fn(), remove: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), asset: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: mocks.user }));
vi.mock("@/lib/catalog/bulk-workspace-service", () => ({ saveBulkWorkspace: mocks.save, deleteBulkWorkspace: mocks.remove, workspaceSelect: { id: true }, workspaceSummarySelect: { id: true } }));
vi.mock("@/lib/prisma", () => ({ prisma: { bulkWorkspace: { findMany: mocks.findMany, findFirst: mocks.findFirst }, bulkWorkspaceAsset: { findFirst: mocks.asset } } }));
import { GET as list } from "../src/app/api/admin/listings/workspaces/route";
import { GET, PUT, DELETE } from "../src/app/api/admin/listings/workspaces/[workspaceId]/route";
import { GET as asset } from "../src/app/api/admin/listings/workspace-media/[assetId]/route";
import { WorkspaceDraftError } from "../src/lib/catalog/bulk-workspace-draft";
const context = { params: Promise.resolve({ workspaceId: "batch-123456789" }) };
const request = (method = "GET", body?: string, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/admin/listings/workspaces/batch-123456789", { method, headers: { Origin: origin }, body });
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "owner", role: "admin", emailVerifiedAtUtc: new Date() }); });
describe("private saved batch routes", () => {
  it("requires admin access before reading or writing a batch", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await list(request())).status).toBe(303); expect((await PUT(request("PUT", "{}"), context)).status).toBe(303);
    expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects cross-site saves and deletes before authentication", async () => {
    expect((await PUT(request("PUT", "{}", "https://other.test"), context)).status).toBe(403);
    expect((await DELETE(request("DELETE", "{}", "https://other.test"), context)).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("scopes batch lists, reads and asset reads to the signed-in owner", async () => {
    mocks.findMany.mockResolvedValue([]); mocks.findFirst.mockResolvedValue(null); mocks.asset.mockResolvedValue(null);
    expect((await list(request())).status).toBe(200); expect(mocks.findMany.mock.calls[0][0].where.sellerUserId).toBe("owner");
    expect((await GET(request(), context)).status).toBe(404); expect(mocks.findFirst.mock.calls[0][0].where.sellerUserId).toBe("owner");
    expect((await asset(request(), { params: Promise.resolve({ assetId: "private" }) })).status).toBe(404);
    expect(mocks.asset.mock.calls[0][0].where.workspace.sellerUserId).toBe("owner");
  });
  it("preserves conflict errors and supplies owner identity from the session", async () => {
    mocks.save.mockRejectedValue(new WorkspaceDraftError("Changed on another device", 409));
    const response = await PUT(request("PUT", JSON.stringify({ name: "100 lots", version: 7, snapshot: {}, sellerUserId: "attacker" })), context);
    expect(response.status).toBe(409); expect(mocks.save.mock.calls[0].slice(0, 2)).toEqual(["owner", "batch-123456789"]);
  });
  it("bounds JSON streams and refuses malformed requests", async () => {
    expect((await PUT(request("PUT", "{"), context)).status).toBe(400);
    expect((await PUT(request("PUT", "x".repeat(2 * 1024 * 1024 + 1)), context)).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
