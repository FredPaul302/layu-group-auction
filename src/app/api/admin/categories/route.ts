import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { CatalogValidationError } from "@/lib/catalog";
import { createCategoryFromFormData } from "@/lib/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);
  if (originResponse) return originResponse;

  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;

  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ message: "Category details must be sent as JSON." }, { status: 415 });
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > 16_384)) {
    return NextResponse.json({ message: "Category details are too large." }, { status: 413 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      !["name", "slug", "description", "minimumStartBid", "minimumBidIncrement", "requiredBidTier"].every((key) => typeof (body as Record<string, unknown>)[key] === "string")) {
      return NextResponse.json({ message: "Complete all required category fields." }, { status: 422 });
    }
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") formData.set(key, value);
    }
    const category = await createCategoryFromFormData(formData);
    return NextResponse.json({ category }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CatalogValidationError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 422 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ code: "duplicate_slug", message: "A category with that name or slug already exists." }, { status: 409 });
    }
    return NextResponse.json({ message: "The category could not be created. Try again." }, { status: 500 });
  }
}
