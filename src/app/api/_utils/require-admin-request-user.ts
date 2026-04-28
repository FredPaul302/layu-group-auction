import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export async function requireAdminRequestUser(request: NextRequest) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return {
      response: NextResponse.redirect(new URL("/auth/login", request.url), {
        status: 303
      }),
      user: null
    };
  }

  if (!isAdmin(user)) {
    return {
      response: NextResponse.redirect(new URL("/account", request.url), {
        status: 303
      }),
      user: null
    };
  }

  return {
    response: null,
    user
  };
}
