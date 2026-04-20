import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getInternalJobSecret() {
  return process.env.INTERNAL_JOB_SECRET?.trim() || null;
}

export function isInternalJobRequestAuthorized(
  request: Pick<Request, "headers">,
  secret = getInternalJobSecret()
) {
  if (!secret) {
    return false;
  }

  const explicitSecret = request.headers.get("x-internal-job-secret")?.trim() ?? "";
  const authorizationHeader = request.headers.get("authorization")?.trim() ?? "";

  return explicitSecret === secret || authorizationHeader === `Bearer ${secret}`;
}

export function requireInternalJobAuthorization(request: NextRequest) {
  if (isInternalJobRequestAuthorized(request)) {
    return null;
  }

  return NextResponse.json(
    {
      status: "unauthorized"
    },
    {
      status: 401
    }
  );
}
