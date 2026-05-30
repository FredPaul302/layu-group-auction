import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import {
  createSignedSessionCookie,
  isValidEmail,
  isValidPassword,
  issueEmailVerification,
  registerUser
} from "@/lib/auth";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import { rateLimitRegister, withRateLimitHeaders } from "@/app/api/_utils/public-auth-rate-limit";

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
      redirectToAppUrl("/auth/register", {
        error: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  if (!email || !password || !confirmPassword) {
    return redirectToAppUrl("/auth/register", {
      error: "missing_fields"
    });
  }

  if (!termsAccepted) {
    return redirectToAppUrl("/auth/register", {
      error: "terms_required"
    });
  }

  if (!isValidEmail(email)) {
    return redirectToAppUrl("/auth/register", {
      error: "invalid_email"
    });
  }

  if (!isValidPassword(password)) {
    return redirectToAppUrl("/auth/register", {
      error: "invalid_password"
    });
  }

  if (password !== confirmPassword) {
    return redirectToAppUrl("/auth/register", {
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
    const response = redirectToAppUrl("/auth/verify-email", {
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
      return redirectToAppUrl("/auth/register", {
        error: "duplicate_email"
      });
    }

    throw error;
  }
}
