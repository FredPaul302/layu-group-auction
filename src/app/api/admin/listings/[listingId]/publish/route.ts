import type { NextRequest } from "next/server";

import { publishListing } from "@/lib/catalog/service";
import { listingMutationErrorCode } from "@/lib/catalog/listing-errors";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";

type PublishRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: PublishRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const auth = await requireAdminRequestUser(request);

  if (auth.response) {
    return auth.response;
  }

  const { listingId } = await context.params;

  try {
    await publishListing(listingId);
  } catch (error) {
    return redirectWithParams(request, `/admin/listings/${listingId}/edit`, {
      error: listingMutationErrorCode(error)
    });
  }

  return redirectWithParams(request, `/admin/listings/${listingId}/edit`, {
    status: "listing_published"
  });
}
