import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPrivateStoredAssetResponse } from "@/app/api/_utils/stored-asset-response";
import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type PaymentProofRouteContext = {
  params: Promise<{
    paymentId: string;
  }>;
};

export async function GET(request: NextRequest, context: PaymentProofRouteContext) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return new NextResponse("Unauthorized", {
      status: 401
    });
  }

  const { paymentId } = await context.params;
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId
    },
    select: {
      proofAssetKey: true,
      order: {
        select: {
          buyerUserId: true
        }
      }
    }
  });

  if (!payment?.proofAssetKey) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  if (!isAdmin(user) && payment.order.buyerUserId !== user.id) {
    return new NextResponse("Forbidden", {
      status: 403
    });
  }

  return buildPrivateStoredAssetResponse(payment.proofAssetKey);
}
