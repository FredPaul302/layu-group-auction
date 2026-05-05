import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AppEnvError } from "@/lib/config/env-error";
import {
  processDiditWebhookPayload,
  verifyDiditWebhookSignature
} from "@/lib/verification/service";

import {
  rateLimitIdentityWebhook,
  rateLimitJsonResponse
} from "@/app/api/_utils/public-auth-rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimitIdentityWebhook(request);

    if (rateLimitResult) {
      return rateLimitJsonResponse(rateLimitResult);
    }

    const rawBody = await request.text();
    let payload: unknown;

    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json(
        {
          status: "invalid_payload"
        },
        {
          status: 400
        }
      );
    }

    if (
      !verifyDiditWebhookSignature({
        payload,
        signatureSimple: request.headers.get("X-Signature-Simple"),
        signatureV2: request.headers.get("X-Signature-V2"),
        timestamp: request.headers.get("X-Timestamp")
      })
    ) {
      return NextResponse.json(
        {
          status: "invalid_signature"
        },
        {
          status: 401
        }
      );
    }

    const result = await processDiditWebhookPayload(payload);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppEnvError) {
      console.error(error.message);

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
}
