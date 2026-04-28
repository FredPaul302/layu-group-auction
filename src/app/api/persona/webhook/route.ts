import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AppEnvError } from "@/lib/config/env-error";
import {
  processPersonaWebhookPayload,
  verifyPersonaWebhookSignature
} from "@/lib/verification/service";

import {
  rateLimitJsonResponse,
  rateLimitPersonaWebhook
} from "@/app/api/_utils/public-auth-rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimitPersonaWebhook(request);

    if (rateLimitResult) {
      return rateLimitJsonResponse(rateLimitResult);
    }

    const rawBody = await request.text();
    const signature = request.headers.get("Persona-Signature");

    if (!verifyPersonaWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        {
          status: "invalid_signature"
        },
        {
          status: 401
        }
      );
    }

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

    const result = await processPersonaWebhookPayload(payload);

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
