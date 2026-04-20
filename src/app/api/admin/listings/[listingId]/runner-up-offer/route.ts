import type { NextRequest } from "next/server";

import { createRunnerUpOfferFromOrder } from "@/lib/auctions";
import { requireAdminUser } from "@/lib/auth";
import { OrderActionError } from "@/lib/orders";

import { redirectWithParams } from "@/app/api/_utils/responses";

type RunnerUpOfferRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: RunnerUpOfferRouteContext) {
  const adminUser = await requireAdminUser();
  const { listingId } = await context.params;
  const formData = await request.formData();
  const orderId = String(formData.get("orderId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  try {
    await createRunnerUpOfferFromOrder({
      listingId,
      orderId,
      offeredByUserId: adminUser.id,
      notes
    });

    return redirectWithParams(request, "/admin/offers", {
      status: "runner_up_offered"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, "/admin/orders", {
        error: error.code
      });
    }

    throw error;
  }
}
