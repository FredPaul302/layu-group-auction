import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthCookieName, getAuthSecret } from "@/lib/auth/config";
import { verifySessionCookieValue } from "@/lib/auth/session-cookie";

const guestOnlyPaths = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/sign-in",
  "/auth/sign-up"
]);

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/auth/login", request.url);
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
  const cookieValue = request.cookies.get(getAuthCookieName())?.value;
  const session = cookieValue
    ? await verifySessionCookieValue(cookieValue, getAuthSecret())
    : null;
  const { pathname } = request.nextUrl;

  if (guestOnlyPaths.has(pathname) && session) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  if (pathname.startsWith("/account") && !session) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  if (pathname.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    if (session.role !== "admin") {
      return NextResponse.redirect(new URL("/account", request.url));
    }
  }

  if (isClaimPath(pathname)) {
    if (!session) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    if (!session.emailVerified) {
      return NextResponse.redirect(new URL("/auth/verify-email?status=required", request.url));
    }

    return NextResponse.redirect(
      new URL("/account/verification?notice=secondary_required", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/account/:path*", "/admin/:path*", "/listings/:path*"]
};
