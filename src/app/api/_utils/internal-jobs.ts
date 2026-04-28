import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AppEnvError, getInternalJobSecret, requireInternalJobSecret } from "@/lib/config/app-env";
import type { DomainJobResult } from "@/lib/jobs/types";
import { logStructuredEvent, serializeError } from "@/lib/ops/structured-logging";

function safeSecretMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
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

  return (
    safeSecretMatch(explicitSecret, secret) ||
    safeSecretMatch(authorizationHeader, `Bearer ${secret}`)
  );
}

export function requireInternalJobAuthorization(request: NextRequest) {
  try {
    const secret = requireInternalJobSecret();

    if (isInternalJobRequestAuthorized(request, secret)) {
      return null;
    }
  } catch (error) {
    if (error instanceof AppEnvError) {
      logStructuredEvent("error", "internal_job_authorization_misconfigured", {
        error: serializeError(error)
      });

      return NextResponse.json(
        {
          status: "service_unavailable"
        },
        {
          status: 503
        }
      );
    }

    throw error;
  }

  logStructuredEvent("warn", "internal_job_unauthorized", {
    method: request.method,
    path: new URL(request.url).pathname
  });

  return NextResponse.json(
    {
      status: "unauthorized"
    },
    {
      status: 401
    }
  );
}

export async function runInternalJobRoute(
  request: NextRequest,
  input: {
    jobName: string;
    run: () => Promise<DomainJobResult>;
  }
) {
  const unauthorizedResponse = requireInternalJobAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const path = new URL(request.url).pathname;

  logStructuredEvent("info", "internal_job_started", {
    jobName: input.jobName,
    method: request.method,
    path
  });

  try {
    const result = await input.run();

    logStructuredEvent("info", "internal_job_completed", {
      method: request.method,
      path,
      ...result
    });

    return NextResponse.json(result);
  } catch (error) {
    logStructuredEvent("error", "internal_job_failed", {
      jobName: input.jobName,
      method: request.method,
      path,
      error: serializeError(error)
    });

    return NextResponse.json(
      {
        jobName: input.jobName,
        status: "error"
      },
      {
        status: 500
      }
    );
  }
}
