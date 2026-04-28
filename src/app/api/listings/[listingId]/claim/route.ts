import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { claimFixedPriceListing, OrderActionError } from "@/lib/orders";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { redirectWithParams, requestExpectsJson } from "@/app/api/_utils/responses";

type ClaimRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: ClaimRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const { listingId } = await context.params;
  const user = await getCurrentUserFromCookieSource(request.cookies);
  const expectsJson = requestExpectsJson(request);

  if (!user) {
    if (expectsJson) {
      return NextResponse.json(
        {
          status: "authentication_required"
        },
        {
          status: 401
        }
      );
    }

    return NextResponse.redirect(new URL("/auth/login", request.url), {
      status: 303
    });
  }

  try {
    const order = await claimFixedPriceListing({
      listingId,
      buyerUserId: user.id
    });

    if (expectsJson) {
      return NextResponse.json({
        status: "reserved",
        orderId: order.id
      });
    }

    return redirectWithParams(request, `/account/orders/${order.id}/payment`, {
      status: "claim_created"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      if (expectsJson) {
        return NextResponse.json(
          {
            status: error.code
          },
          {
            status: error.statusCode
          }
        );
      }

      return redirectWithParams(request, `/listings/${listingId}/claim`, {
        error: error.code
      });
    }

    throw error;
  }
}
