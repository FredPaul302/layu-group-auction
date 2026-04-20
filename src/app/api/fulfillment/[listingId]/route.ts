import type { NextRequest } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { OrderActionError, updateOrderFulfillmentSelection } from "@/lib/orders";

import { redirectWithParams } from "@/app/api/_utils/responses";

type FulfillmentRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: FulfillmentRouteContext) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return redirectWithParams(request, "/auth/login");
  }

  const { listingId } = await context.params;
  const formData = await request.formData();
  const fulfillmentMode =
    String(formData.get("fulfillmentMode") ?? "") === "pickup_only"
      ? "pickup_only"
      : "shipping_only";

  try {
    await updateOrderFulfillmentSelection({
      listingId,
      userId: user.id,
      desiredFulfillmentMode: fulfillmentMode,
      shippingAddress:
        fulfillmentMode === "shipping_only"
          ? {
              recipientName: String(formData.get("recipientName") ?? ""),
              addressLine1: String(formData.get("addressLine1") ?? ""),
              addressLine2: String(formData.get("addressLine2") ?? ""),
              city: String(formData.get("city") ?? ""),
              stateOrProvince: String(formData.get("stateOrProvince") ?? ""),
              postalCode: String(formData.get("postalCode") ?? ""),
              countryCode: String(formData.get("countryCode") ?? ""),
              phoneNumber: String(formData.get("phoneNumber") ?? "")
            }
          : null
    });

    return redirectWithParams(request, `/account/fulfillment/${listingId}`, {
      status: "fulfillment_saved"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, `/account/fulfillment/${listingId}`, {
        error: error.code
      });
    }

    throw error;
  }
}
