import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { prisma } from "@/lib/prisma";
import { deleteBulkWorkspace, saveBulkWorkspace, workspaceSelect } from "@/lib/catalog/bulk-workspace-service";
import { WorkspaceDraftError, workspaceSnapshotMaxBytes } from "@/lib/catalog/bulk-workspace-draft";
type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const { workspaceId } = await context.params;
  const workspace = await prisma.bulkWorkspace.findFirst({ where: { id: workspaceId, sellerUserId: auth.user.id }, select: workspaceSelect });
  return NextResponse.json(workspace ? { workspace } : { message: "Saved batch not found." }, { status: workspace ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
}

async function mutate(request: NextRequest, context: Context, remove: boolean) {
  const origin = requireSameOriginRequest(request);
  if (origin) return origin;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const { workspaceId } = await context.params;
  try {
    // Bound streamed JSON even when content-length is absent or incorrect.
    const reader = request.body?.getReader();
    if (!reader) throw new WorkspaceDraftError("Missing saved batch.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > workspaceSnapshotMaxBytes) { await reader.cancel(); throw new WorkspaceDraftError("Saved batch details exceed 2 MB.", 413); } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object") throw new WorkspaceDraftError("Invalid saved batch.", 400);
    if (remove) { await deleteBulkWorkspace(auth.user.id, workspaceId, body.version); return NextResponse.json({ deleted: true }); }
    const workspace = await saveBulkWorkspace(auth.user.id, workspaceId, body);
    return NextResponse.json({ workspace });
  } catch (error) {
    if (error instanceof WorkspaceDraftError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Invalid saved batch details." }, { status: 400 });
    console.warn("Workspace save failed", { workspaceId });
    return NextResponse.json({ message: "Could not save to your account. Keep this tab open and retry." }, { status: 500 });
  }
}
export const PUT = (request: NextRequest, context: Context) => mutate(request, context, false);
export const DELETE = (request: NextRequest, context: Context) => mutate(request, context, true);
