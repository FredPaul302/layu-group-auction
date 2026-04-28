import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { VerificationActionError } from "@/lib/verification";
import { reviewDepositSubmission } from "@/lib/verification/service";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";

type ReviewRouteContext = {
  params: Promise<{
    verificationId: string;
  }>;
};

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

function isReviewDecision(value: string): value is "approve" | "reject" | "refund" | "forfeit" {
  return ["approve", "reject", "refund", "forfeit"].includes(value);
}

export async function POST(request: NextRequest, context: ReviewRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user || !isAdmin(user)) {
    return redirectTo(request, "/auth/login");
  }

  const { verificationId } = await context.params;
  const formData = await request.formData();
  const decision = String(formData.get("decision") ?? "");
  const reviewNotes = String(formData.get("reviewNotes") ?? "");

  if (!isReviewDecision(decision)) {
    return redirectTo(request, "/admin/deposits", {
      error: "deposit_review_invalid"
    });
  }

  try {
    await reviewDepositSubmission({
      depositId: verificationId,
      reviewedByUserId: user.id,
      decision,
      reviewNotes
    });
  } catch (error) {
    if (error instanceof VerificationActionError) {
      return redirectTo(request, "/admin/deposits", {
        error: error.code
      });
    }

    throw error;
  }

  return redirectTo(request, "/admin/deposits", {
    status: "deposit_reviewed"
  });
}
