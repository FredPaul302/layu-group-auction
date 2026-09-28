import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { prisma } from "@/lib/prisma";
import { workspaceSummarySelect } from "@/lib/catalog/bulk-workspace-service";
export async function GET(request: NextRequest) {
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const workspaces = await prisma.bulkWorkspace.findMany({ where: { sellerUserId: auth.user.id }, select: workspaceSummarySelect, orderBy: { updatedAtUtc: "desc" } });
  return NextResponse.json({ workspaces }, { headers: { "Cache-Control": "private, no-store" } });
}
