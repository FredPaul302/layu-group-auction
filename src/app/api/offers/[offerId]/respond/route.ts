import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { respondToRunnerUpOffer } from "@/lib/auctions";
import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { OrderActionError } from "@/lib/orders";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { redirectWithParams } from "@/app/api/_utils/responses";

type RunnerUpOfferResponseContext = {
  params: Promise<{
    offerId: string;
  }>;
};

export async function POST(request: NextRequest, context: RunnerUpOfferResponseContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url), {
      status: 303
    });
  }

  const { offerId } = await context.params;
  const formData = await request.formData();
  const decision = String(formData.get("decision") ?? "");

  if (decision !== "accept" && decision !== "decline") {
    return redirectWithParams(request, "/account/offers", {
      error: "order_status_invalid"
    });
  }

  try {
    const result = await respondToRunnerUpOffer({
      offerId,
      userId: user.id,
      decision
    });

    if (decision === "accept" && result.order) {
      return redirectWithParams(request, `/account/orders/${result.order.id}/payment`, {
        status: "runner_up_accepted"
      });
    }

    return redirectWithParams(request, "/account/offers", {
      status: "runner_up_declined"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, "/account/offers", {
        error: error.code
      });
    }

    throw error;
  }
}
