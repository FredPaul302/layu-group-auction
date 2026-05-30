import type { NextRequest } from "next/server";

import { deleteCurrentSession, getExpiredSessionCookie } from "@/lib/auth";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  await deleteCurrentSession(request.cookies);

  const response = redirectToAppUrl("/auth/login", {
    status: "signed_out"
  });
  const expiredCookie = getExpiredSessionCookie();
  response.cookies.set(expiredCookie.cookieName, expiredCookie.cookieValue, expiredCookie.cookieOptions);

  return response;
}
