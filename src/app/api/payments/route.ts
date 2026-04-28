import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { OrderActionError } from "@/lib/orders";
import { submitOrderPayment } from "@/lib/payments";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { redirectWithParams } from "@/app/api/_utils/responses";

export async function POST(request: NextRequest) {
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

  const formData = await request.formData();
  const orderId = String(formData.get("orderId") ?? "");
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "");
  const amountCents = Number(formData.get("amountCents") ?? Number.NaN);
  const payerHandle = String(formData.get("payerHandle") ?? "");
  const externalReference = String(formData.get("externalReference") ?? "");
  const screenshotFile = formData.get("screenshot");

  try {
    const payment = await submitOrderPayment({
      orderId,
      submittedByUserId: user.id,
      paymentMethodId,
      amountCents,
      payerHandle,
      externalReference,
      screenshotFile: screenshotFile instanceof File ? screenshotFile : null
    });

    return redirectWithParams(request, `/account/orders/${payment.orderId}/payment`, {
      status: "payment_submitted"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, `/account/orders/${orderId}/payment`, {
        error: error.code
      });
    }

    throw error;
  }
}
