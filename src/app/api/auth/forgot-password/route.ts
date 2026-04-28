import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { issuePasswordReset } from "@/lib/auth";

import {
  rateLimitForgotPassword,
  withRateLimitHeaders
} from "@/app/api/_utils/public-auth-rate-limit";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const rateLimitResult = await rateLimitForgotPassword(request, email);

  if (rateLimitResult) {
    const response = NextResponse.redirect(
      new URL("/auth/forgot-password?error=too_many_attempts", request.url),
      {
        status: 303
      }
    );

    return withRateLimitHeaders(response, rateLimitResult);
  }

  if (email) {
    await issuePasswordReset(email);
  }

  return NextResponse.redirect(new URL("/auth/forgot-password?status=sent", request.url), {
    status: 303
  });
}
