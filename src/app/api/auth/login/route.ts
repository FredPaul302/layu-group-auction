import type { NextRequest } from "next/server";

import {
  authenticateUser,
  createSignedSessionCookie,
  getSafeNextPath,
  isValidEmail
} from "@/lib/auth";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import { rateLimitLogin, withRateLimitHeaders } from "@/app/api/_utils/public-auth-rate-limit";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafeNextPath(String(formData.get("next") ?? ""), "/account");
  const rateLimitResult = await rateLimitLogin(request, email);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectToAppUrl("/auth/login", {
        error: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  if (!email || !password) {
    return redirectToAppUrl("/auth/login", {
      error: "missing_fields"
    });
  }

  if (!isValidEmail(email)) {
    return redirectToAppUrl("/auth/login", {
      error: "invalid_email"
    });
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    return redirectToAppUrl("/auth/login", {
      error: "invalid_credentials"
    });
  }

  const sessionCookie = await createSignedSessionCookie(user);
  const response = redirectToAppUrl(nextPath);
  response.cookies.set(
    sessionCookie.cookieName,
    sessionCookie.cookieValue,
    sessionCookie.cookieOptions
  );

  return response;
}
