import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPrivateStoredAssetResponse } from "@/app/api/_utils/stored-asset-response";
import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type DepositProofRouteContext = {
  params: Promise<{
    verificationId: string;
  }>;
};

export async function GET(request: NextRequest, context: DepositProofRouteContext) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return new NextResponse("Unauthorized", {
      status: 401
    });
  }

  const { verificationId } = await context.params;
  const deposit = await prisma.deposit.findUnique({
    where: {
      id: verificationId
    },
    select: {
      proofAssetKey: true,
      userId: true
    }
  });

  if (!deposit?.proofAssetKey) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  if (!isAdmin(user) && deposit.userId !== user.id) {
    return new NextResponse("Forbidden", {
      status: 403
    });
  }

  return buildPrivateStoredAssetResponse(deposit.proofAssetKey);
}
