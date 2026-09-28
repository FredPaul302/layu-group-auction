import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { listingBatchIds, manageListingBatch } from "@/lib/catalog/batch-operations";
import { CatalogValidationError } from "@/lib/catalog";

export async function POST(request: NextRequest) {
  const origin = requireSameOriginRequest(request);
  if (origin) return origin;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || (body.action !== "publish" && body.action !== "delete")) return NextResponse.json({ message: "Choose publish or delete." }, { status: 400 });
    const result = await manageListingBatch({ ids: listingBatchIds(body.ids), action: body.action, sellerUserId: auth.user.id });
    return NextResponse.json({ ...result, message: `${result.count} listing${result.count === 1 ? "" : "s"} ${body.action === "publish" ? "published" : "deleted"}.` });
  } catch (error) {
    if (error instanceof CatalogValidationError) return NextResponse.json({ message: error.message, status: error.code }, { status: 422 });
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    console.error("Listing batch failed", error);
    return NextResponse.json({ message: "The action could not be completed. Refresh and check the listings before retrying." }, { status: 500 });
  }
}
