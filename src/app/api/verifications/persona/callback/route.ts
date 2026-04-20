import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { syncPersonaHostedReturn } from "@/lib/verification/service";

function redirectTo(request: NextRequest, status: string) {
  const url = new URL("/account/verification/persona", request.url);
  url.searchParams.set("status", status);

  return NextResponse.redirect(url, {
    status: 303
  });
}

export async function GET(request: NextRequest) {
  const inquiryId = request.nextUrl.searchParams.get("inquiry-id");
  const referenceId = request.nextUrl.searchParams.get("reference-id");
  const status = request.nextUrl.searchParams.get("status");

  if (!inquiryId) {
    return redirectTo(request, "returned");
  }

  const localStatus = await syncPersonaHostedReturn({
    inquiryId,
    referenceId,
    status
  });

  return redirectTo(
    request,
    localStatus === "pending" ? "returned" : localStatus
  );
}
