import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { OrderActionError } from "@/lib/orders";
import { reviewPaymentSubmission } from "@/lib/payments";

import { redirectWithParams } from "@/app/api/_utils/responses";

type PaymentReviewRouteContext = {
  params: Promise<{
    paymentId: string;
  }>;
};

export async function POST(request: NextRequest, context: PaymentReviewRouteContext) {
  const adminUser = await requireAdminUser();
  const { paymentId } = await context.params;
  const formData = await request.formData();
  const decision = String(formData.get("decision") ?? "");
  const reviewNotes = String(formData.get("reviewNotes") ?? "");

  if (decision !== "approve" && decision !== "reject") {
    return redirectWithParams(request, `/admin/payments/${paymentId}`, {
      error: "payment_review_invalid"
    });
  }

  try {
    await reviewPaymentSubmission({
      paymentId,
      reviewedByUserId: adminUser.id,
      decision,
      reviewNotes
    });

    return redirectWithParams(request, `/admin/payments/${paymentId}`, {
      status: decision === "approve" ? "payment_confirmed" : "payment_rejected"
    });
  } catch (error) {
    if (error instanceof OrderActionError) {
      return redirectWithParams(request, `/admin/payments/${paymentId}`, {
        error: error.code
      });
    }

    throw error;
  }
}
