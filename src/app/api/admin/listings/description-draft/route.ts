import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import {
  createListingDescriptionDraft,
  DescriptionDraftError,
  descriptionDraftMaxRequestBytes,
  descriptionDraftMaxTextRequestBytes,
  isListingDescriptionDraftEnabled,
  readDescriptionBody
} from "@/lib/ai/listing-description";
import { validateDescriptionPhotos } from "@/lib/ai/description-photo-validation";
import { validateDescriptionDraftInput } from "@/lib/catalog/description-draft-input";
import { consumeRateLimits } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ status: code, message }, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);
  if (originResponse) {
    return originResponse;
  }
  const auth = await requireAdminRequestUser(request);
  if (auth.response) {
    return auth.response;
  }

  if (!isListingDescriptionDraftEnabled()) {
    return errorResponse(503, "description_ai_disabled", "AI drafting is currently turned off. You can still write and save descriptions.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "AI drafting requires JSON item details.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > descriptionDraftMaxRequestBytes)) {
    return errorResponse(413, "description_payload_too_large", "Item details or photos exceed the AI drafting size limit.");
  }

  try {
    const body = await readDescriptionBody(request.body, descriptionDraftMaxRequestBytes);
    const payload = JSON.parse(body) as unknown;
    const validation = validateDescriptionDraftInput(payload);
    if (!validation.input) {
      return errorResponse(422, "description_input_invalid", validation.error);
    }
    if (!validation.input.images?.length && Buffer.byteLength(body, "utf8") > descriptionDraftMaxTextRequestBytes) {
      return errorResponse(413, "description_payload_too_large", "Item details are too long for AI drafting.");
    }
    const photoError = validateDescriptionPhotos(validation.input.images);
    if (photoError) {
      return errorResponse(422, "description_input_invalid", photoError);
    }

    const rateLimit = await consumeRateLimits([
      { bucket: "listing-ai-admin-hour", identifiers: [auth.user.id], limit: 100, windowMs: 60 * 60 * 1000 },
      { bucket: "listing-ai-site-day", identifiers: ["all"], limit: 100, windowMs: 24 * 60 * 60 * 1000 }
    ]);
    if (rateLimit) {
      return NextResponse.json({
        status: "description_rate_limited",
        message: "The AI drafting limit has been reached. Try again later or continue writing descriptions yourself."
      }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) }
      });
    }

    const result = await createListingDescriptionDraft(validation.input, fetch, request.signal);
    return NextResponse.json({ ...result, status: "description_draft_ready" }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof DescriptionDraftError) {
      return errorResponse(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError) {
      return errorResponse(400, "description_payload_invalid", "Item details could not be read. Try again.");
    }
    return errorResponse(500, "description_draft_failed", "AI drafting could not finish. Your title and description have not changed.");
  }
}
