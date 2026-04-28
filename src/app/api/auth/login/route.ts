import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  authenticateUser,
  createSignedSessionCookie,
  getSafeNextPath,
  isValidEmail
} from "@/lib/auth";

import { rateLimitLogin, withRateLimitHeaders } from "@/app/api/_utils/public-auth-rate-limit";

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafeNextPath(String(formData.get("next") ?? ""), "/account");
  const rateLimitResult = await rateLimitLogin(request, email);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectTo(request, "/auth/login", {
        error: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  if (!email || !password) {
    return redirectTo(request, "/auth/login", {
      error: "missing_fields"
    });
  }

  if (!isValidEmail(email)) {
    return redirectTo(request, "/auth/login", {
      error: "invalid_email"
    });
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    return redirectTo(request, "/auth/login", {
      error: "invalid_credentials"
    });
  }

  const sessionCookie = await createSignedSessionCookie(user);
  const response = redirectTo(request, nextPath);
  response.cookies.set(
    sessionCookie.cookieName,
    sessionCookie.cookieValue,
    sessionCookie.cookieOptions
  );

  return response;
}
