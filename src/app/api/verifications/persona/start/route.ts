import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { startPersonaVerificationFlow } from "@/lib/verification/service";

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
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return redirectTo(request, "/auth/login");
  }

  if (!hasVerifiedEmail(user)) {
    return redirectTo(request, "/auth/verify-email", {
      status: "required"
    });
  }

  const result = await startPersonaVerificationFlow(user.id);

  if (result.status === "not_configured") {
    return redirectTo(request, "/account/verification/persona", {
      status: "not_configured"
    });
  }

  if (result.status === "already_approved") {
    return redirectTo(request, "/account/verification/persona", {
      status: "already_approved"
    });
  }

  return NextResponse.redirect(result.redirectUrl, {
    status: 303
  });
}
