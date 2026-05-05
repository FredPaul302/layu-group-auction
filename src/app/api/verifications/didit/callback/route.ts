import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { syncDiditHostedReturn } from "@/lib/verification/service";

function redirectTo(request: NextRequest, status: string) {
  const url = new URL("/account/verification/identity", request.url);
  url.searchParams.set("status", status);

  return NextResponse.redirect(url, {
    status: 303
  });
}

export async function GET(request: NextRequest) {
  const verificationSessionId = request.nextUrl.searchParams.get("verificationSessionId");

  if (verificationSessionId) {
    await syncDiditHostedReturn({
      verificationSessionId
    });
  }

  return redirectTo(request, "returned");
}
