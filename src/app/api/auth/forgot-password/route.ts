import type { NextRequest } from "next/server";

import { issuePasswordReset } from "@/lib/auth";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import {
  rateLimitForgotPassword,
  withRateLimitHeaders
} from "@/app/api/_utils/public-auth-rate-limit";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const rateLimitResult = await rateLimitForgotPassword(request, email);

  if (rateLimitResult) {
    const response = redirectToAppUrl("/auth/forgot-password", {
      error: "too_many_attempts"
    });

    return withRateLimitHeaders(response, rateLimitResult);
  }

  if (email) {
    await issuePasswordReset(email);
  }

  return redirectToAppUrl("/auth/forgot-password", {
    status: "sent"
  });
}
