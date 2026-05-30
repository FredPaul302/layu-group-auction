import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifySessionCookieValue } from "@/lib/auth/session-cookie";
import { getEdgeAppUrl, getEdgeAuthCookieName, getEdgeAuthSecret } from "@/lib/config/edge-env";

const guestOnlyPaths = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/sign-in",
  "/auth/sign-up"
]);

function buildAppUrl(path: string) {
  return new URL(path, getEdgeAppUrl());
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = buildAppUrl("/auth/login");
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath !== "/auth/login") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

function isClaimPath(pathname: string) {
  return /^\/listings\/[^/]+\/claim$/u.test(pathname);
}

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(getEdgeAuthCookieName())?.value;
  const session = cookieValue
    ? await verifySessionCookieValue(cookieValue, getEdgeAuthSecret())
    : null;
  const { pathname } = request.nextUrl;

  if (guestOnlyPaths.has(pathname) && session) {
    return NextResponse.redirect(buildAppUrl("/account"));
  }

  if (pathname.startsWith("/account") && !session) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  if (pathname.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    if (session.role !== "admin") {
      return NextResponse.redirect(buildAppUrl("/account"));
    }
  }

  if (isClaimPath(pathname)) {
    if (!session) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    if (!session.emailVerified) {
      return NextResponse.redirect(buildAppUrl("/auth/verify-email?status=required"));
    }

    return NextResponse.redirect(
      buildAppUrl("/account/verification?notice=secondary_required")
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/account/:path*", "/admin/:path*", "/listings/:path*"]
};
