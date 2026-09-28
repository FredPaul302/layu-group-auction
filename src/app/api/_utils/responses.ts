import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/config/app-env";

export function redirectWithParams(
  request: NextRequest,
  path: string,
  params?: Record<string, string>
) {
  const url = new URL(path, getAppEnv().app.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

export function requestExpectsJson(request: NextRequest) {
  const acceptHeader = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";

  return acceptHeader.includes("application/json") || contentType.includes("application/json");
}
