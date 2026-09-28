import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { CatalogValidationError } from "@/lib/catalog";
import { CrossListingError, prepareCrossListings } from "@/lib/cross-listing/service";
import { readCrossListingRequest } from "@/lib/cross-listing/request-body";

export async function POST(request: NextRequest) {
  const origin = requireSameOriginRequest(request); if (origin) return origin;
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  try {
    const body = await readCrossListingRequest(request);
    const result = await prepareCrossListings({ sellerUserId: auth.user.id, listingIds: body?.listingIds, channels: body?.channels });
    return NextResponse.json({ ...result, message: `${result.count} destination records prepared. Existing records and edits were kept. Nothing has been posted yet.` });
  } catch (error) {
    if (error instanceof CrossListingError || error instanceof CatalogValidationError || error instanceof SyntaxError) return NextResponse.json({ message: error instanceof SyntaxError ? "Invalid request." : error.message }, { status: 422 });
    return NextResponse.json({ message: "The preparation could not be saved. Refresh before retrying." }, { status: 500 });
  }
}
