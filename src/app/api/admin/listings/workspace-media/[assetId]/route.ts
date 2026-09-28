import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { buildPrivateStoredAssetResponse } from "@/app/api/_utils/stored-asset-response";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  const { assetId } = await context.params;
  const asset = await prisma.bulkWorkspaceAsset.findFirst({ where: { id: assetId, workspace: { sellerUserId: auth.user.id } } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  return buildPrivateStoredAssetResponse(asset.storageKey);
}
