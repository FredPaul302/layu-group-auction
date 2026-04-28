import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createSignedSessionCookie,
  isValidEmail,
  isValidPassword,
  issueEmailVerification,
  registerUser
} from "@/lib/auth";

import { rateLimitRegister, withRateLimitHeaders } from "@/app/api/_utils/public-auth-rate-limit";

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
  const displayName = String(formData.get("displayName") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const termsAccepted = formData.get("termsAccepted") === "yes";
  const rateLimitResult = await rateLimitRegister(request, email);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectTo(request, "/auth/register", {
        error: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  if (!email || !password || !confirmPassword) {
    return redirectTo(request, "/auth/register", {
      error: "missing_fields"
    });
  }

  if (!termsAccepted) {
    return redirectTo(request, "/auth/register", {
      error: "terms_required"
    });
  }

  if (!isValidEmail(email)) {
    return redirectTo(request, "/auth/register", {
      error: "invalid_email"
    });
  }

  if (!isValidPassword(password)) {
    return redirectTo(request, "/auth/register", {
      error: "invalid_password"
    });
  }

  if (password !== confirmPassword) {
    return redirectTo(request, "/auth/register", {
      error: "password_mismatch"
    });
  }

  try {
    const user = await registerUser({
      email,
      displayName,
      password
    });

    await issueEmailVerification(user);

    const sessionCookie = await createSignedSessionCookie(user);
    const response = redirectTo(request, "/auth/verify-email", {
      status: "check_inbox"
    });
    response.cookies.set(
      sessionCookie.cookieName,
      sessionCookie.cookieValue,
      sessionCookie.cookieOptions
    );

    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return redirectTo(request, "/auth/register", {
        error: "duplicate_email"
      });
    }

    throw error;
  }
}
