import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  processPersonaWebhookPayload,
  verifyPersonaWebhookSignature
} from "@/lib/verification/service";

export async function POST(request: NextRequest) {
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

  const payload = JSON.parse(rawBody) as unknown;
  const result = await processPersonaWebhookPayload(payload);

  return NextResponse.json(result);
}
