import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  consumeEmailVerificationToken,
  getCurrentUserFromCookieSource,
  getExpiredSessionCookie,
  getSessionSnapshotFromRequestCookies,
  issueEmailVerification,
  refreshSignedSessionCookieFromSnapshot
} from "@/lib/auth";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import {
  rateLimitEmailVerificationResend,
  rateLimitEmailVerificationToken,
  withRateLimitHeaders
} from "@/app/api/_utils/public-auth-rate-limit";

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return redirectTo(request, "/auth/verify-email", {
      status: "invalid"
    });
  }

  const rateLimitResult = await rateLimitEmailVerificationToken(request, token);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectTo(request, "/auth/verify-email", {
        status: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  const result = await consumeEmailVerificationToken(token);

  if (result.status === "invalid" || result.status === "expired") {
    return redirectTo(request, "/auth/verify-email", {
      status: result.status
    });
  }

  const response = redirectTo(request, "/auth/verify-email", {
    status: "success"
  });
  const currentSnapshot = await getSessionSnapshotFromRequestCookies(request.cookies);

  if (currentSnapshot?.userId === result.user.id) {
    const refreshedCookie = await refreshSignedSessionCookieFromSnapshot(currentSnapshot, result.user);
    response.cookies.set(
      refreshedCookie.cookieName,
      refreshedCookie.cookieValue,
      refreshedCookie.cookieOptions
    );
  }

  return response;
}

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    const expiredCookie = getExpiredSessionCookie();
    const response = redirectTo(request, "/auth/login");
    response.cookies.set(expiredCookie.cookieName, expiredCookie.cookieValue, expiredCookie.cookieOptions);
    return response;
  }

  if (user.emailVerifiedAtUtc) {
    return redirectTo(request, "/account");
  }

  const rateLimitResult = await rateLimitEmailVerificationResend(request, user);

  if (rateLimitResult) {
    return withRateLimitHeaders(
      redirectTo(request, "/auth/verify-email", {
        status: "too_many_attempts"
      }),
      rateLimitResult
    );
  }

  await issueEmailVerification(user);

  return redirectTo(request, "/auth/verify-email", {
    status: "resent"
  });
}
