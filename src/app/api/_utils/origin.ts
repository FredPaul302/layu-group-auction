import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAppEnv } from "@/lib/config/app-env";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string) {
  try {
    return new URL(value.replace(/\/+$/u, "")).origin;
  } catch {
    return null;
  }
}

export function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export function isSameOriginRequest(
  request: Pick<NextRequest, "headers" | "method">,
  configuredAppUrl = getAppEnv().app.url
) {
  if (!isMutationMethod(request.method)) {
    return true;
  }

  const configuredOrigin = normalizeOrigin(configuredAppUrl);

  if (!configuredOrigin) {
    return false;
  }

  const originHeader = request.headers.get("origin");

  if (originHeader) {
    return normalizeOrigin(originHeader) === configuredOrigin;
  }

  const refererHeader = request.headers.get("referer");

  if (!refererHeader) {
    return false;
  }

  return normalizeOrigin(refererHeader) === configuredOrigin;
}

export function requireSameOriginRequest(
  request: NextRequest,
  configuredAppUrl = getAppEnv().app.url
) {
  if (isSameOriginRequest(request, configuredAppUrl)) {
    return null;
  }

  return NextResponse.json(
    {
      status: "same_origin_required"
    },
    {
      status: 403
    }
  );
}
