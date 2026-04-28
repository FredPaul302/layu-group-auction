import { headers } from "next/headers";

import { requireAdminUser } from "@/lib/auth";
import { getAppEnv } from "@/lib/config/app-env";

export class ServerActionOriginError extends Error {
  constructor(message = "Server Action request must be same-origin.") {
    super(message);
    this.name = "ServerActionOriginError";
  }
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value.replace(/\/+$/u, "")).origin;
  } catch {
    return null;
  }
}

export function isSameOriginServerActionOrigin(
  originHeader: string | null,
  configuredAppUrl = getAppEnv().app.url
) {
  if (!originHeader) {
    return false;
  }

  const configuredOrigin = normalizeOrigin(configuredAppUrl);
  const requestOrigin = normalizeOrigin(originHeader);

  return Boolean(configuredOrigin && requestOrigin && configuredOrigin === requestOrigin);
}

export async function requireSameOriginServerActionRequest() {
  const headerStore = await headers();
  const originHeader = headerStore.get("origin");
  const appEnv = getAppEnv();

  if (!originHeader) {
    if (appEnv.runtime.isProduction) {
      throw new ServerActionOriginError();
    }

    return;
  }

  if (!isSameOriginServerActionOrigin(originHeader, appEnv.app.url)) {
    throw new ServerActionOriginError();
  }
}

export async function requireAdminServerActionUser() {
  await requireSameOriginServerActionRequest();

  return requireAdminUser();
}
