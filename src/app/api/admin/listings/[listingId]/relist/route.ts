import type { NextRequest } from "next/server";

import { relistListing, type RelistMode } from "@/lib/catalog/relist";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";

type RelistRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: RelistRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const auth = await requireAdminRequestUser(request);

  if (auth.response) {
    return auth.response;
  }

  const { listingId } = await context.params;
  const formData = await request.formData();
  const mode = String(formData.get("mode") ?? "same_settings") as RelistMode;
  const relistMode = mode === "edit" ? "edit" : "same_settings";

  const relistedListing = await relistListing({
    listingId,
    mode: relistMode
  });

  if (relistMode === "edit") {
    return redirectWithParams(request, `/admin/listings/${relistedListing.id}/edit`, {
      status: "listing_relisted_for_edit"
    });
  }

  return redirectWithParams(request, `/admin/listings/${relistedListing.id}`, {
    status: "listing_relisted"
  });
}
