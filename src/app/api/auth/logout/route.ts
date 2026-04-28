import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { deleteCurrentSession, getExpiredSessionCookie } from "@/lib/auth";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  await deleteCurrentSession(request.cookies);

  const response = NextResponse.redirect(new URL("/auth/login?status=signed_out", request.url), {
    status: 303
  });
  const expiredCookie = getExpiredSessionCookie();
  response.cookies.set(expiredCookie.cookieName, expiredCookie.cookieValue, expiredCookie.cookieOptions);

  return response;
}
