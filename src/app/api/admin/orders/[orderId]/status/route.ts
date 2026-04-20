import type { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { OrderActionError, updateOrderStatusByAdmin } from "@/lib/orders";

import { redirectWithParams } from "@/app/api/_utils/responses";

type AdminOrderStatusRouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function POST(request: NextRequest, context: AdminOrderStatusRouteContext) {
  await requireAdminUser();
  const { orderId } = await context.params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");

  if (
    action !== "mark_paid" &&
    action !== "mark_ready_for_fulfillment" &&
    action !== "mark_fulfilled" &&
    action !== "mark_completed" &&
    action !== "mark_cancelled"
  ) {
    return redirectWithParams(request, "/admin/orders", {
      error: "order_status_invalid"
    });
  }

  try {
    await updateOrderStatusByAdmin({
      orderId,
      action
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, "/admin/orders", {
        error: error.code
      });
    }

    throw error;
  }

  return redirectWithParams(request, "/admin/orders", {
    status: "order_updated"
  });
}
