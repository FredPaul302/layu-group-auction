import { NextResponse } from "next/server";

import { getAppEnv } from "@/lib/config/app-env";

export function buildAppUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, getAppEnv().app.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

export function redirectToAppUrl(path: string, params?: Record<string, string>) {
  return NextResponse.redirect(buildAppUrl(path, params), {
    status: 303
  });
}
