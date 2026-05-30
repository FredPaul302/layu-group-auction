import type { NextRequest } from "next/server";

import { consumePasswordResetToken, getExpiredSessionCookie, isValidPassword } from "@/lib/auth";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import {
  rateLimitPasswordReset,
  withRateLimitHeaders
} from "@/app/api/_utils/public-auth-rate-limit";

function redirectToResetPassword(token: string, error: string) {
  return redirectToAppUrl("/auth/reset-password", {
    token,
    error
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token || !password || !confirmPassword) {
    return redirectToResetPassword(token, "missing_fields");
  }

  if (!isValidPassword(password)) {
    return redirectToResetPassword(token, "invalid_password");
  }

  if (password !== confirmPassword) {
    return redirectToResetPassword(token, "password_mismatch");
  }

  const rateLimitResult = await rateLimitPasswordReset(request, token);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectToResetPassword(token, "too_many_attempts"),
      rateLimitResult
    );
  }

  const result = await consumePasswordResetToken({
    token,
    password
  });

  if (result.status === "invalid" || result.status === "expired") {
    return redirectToResetPassword(token, result.status);
  }

  const response = redirectToAppUrl("/auth/login", {
    status: "password_reset"
  });
  const expiredCookie = getExpiredSessionCookie();
  response.cookies.set(expiredCookie.cookieName, expiredCookie.cookieValue, expiredCookie.cookieOptions);

  return response;
}
