import type { NextRequest } from "next/server";

import { unpublishListing } from "@/lib/catalog/service";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";

type UnpublishRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: UnpublishRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const auth = await requireAdminRequestUser(request);

  if (auth.response) {
    return auth.response;
  }

  const { listingId } = await context.params;

  await unpublishListing(listingId);

  return redirectWithParams(request, `/admin/listings/${listingId}/edit`, {
    status: "listing_unpublished"
  });
}
