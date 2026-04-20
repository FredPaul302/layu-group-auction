import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumePasswordResetToken, getExpiredSessionCookie, isValidPassword } from "@/lib/auth";

function redirectTo(request: NextRequest, token: string, error: string) {
  const url = new URL("/auth/reset-password", request.url);
  url.searchParams.set("token", token);
  url.searchParams.set("error", error);

  return NextResponse.redirect(url, {
    status: 303
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token || !password || !confirmPassword) {
    return redirectTo(request, token, "missing_fields");
  }

  if (!isValidPassword(password)) {
    return redirectTo(request, token, "invalid_password");
  }

  if (password !== confirmPassword) {
    return redirectTo(request, token, "password_mismatch");
  }

  const result = await consumePasswordResetToken({
    token,
    password
  });

  if (result.status === "invalid" || result.status === "expired") {
    return redirectTo(request, token, result.status);
  }

  const response = NextResponse.redirect(new URL("/auth/login?status=password_reset", request.url), {
    status: 303
  });
  const expiredCookie = getExpiredSessionCookie();
  response.cookies.set(expiredCookie.cookieName, expiredCookie.cookieValue, expiredCookie.cookieOptions);

  return response;
}
