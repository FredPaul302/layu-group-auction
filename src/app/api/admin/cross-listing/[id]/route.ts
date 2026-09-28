import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { CrossListingError, actOnCrossListing } from "@/lib/cross-listing/service";
import { readCrossListingRequest } from "@/lib/cross-listing/request-body";
export const maxDuration = 120;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const origin = requireSameOriginRequest(request); if (origin) return origin;
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  try {
    const { id } = await context.params;
    const body = await readCrossListingRequest(request);
    if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    return NextResponse.json(await actOnCrossListing({ sellerUserId: auth.user.id, id, version: body.version, action: body.action, fields: body.fields, externalUrl: body.externalUrl, checked: body.checked }));
  } catch (error) {
    if (error instanceof CrossListingError || error instanceof SyntaxError) return NextResponse.json({ message: error instanceof SyntaxError ? "Invalid request." : error.message }, { status: 422 });
    return NextResponse.json({ message: "The result could not be confirmed. Refresh and check the destination before retrying." }, { status: 500 });
  }
}
