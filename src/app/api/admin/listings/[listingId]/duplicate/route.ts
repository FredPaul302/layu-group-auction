import type { NextRequest } from "next/server";

import { relistListing } from "@/lib/catalog/relist";
import { listingMutationErrorCode } from "@/lib/catalog/listing-errors";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";

type DuplicateRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: DuplicateRouteContext) {
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
    const duplicatedListing = await relistListing({
      listingId,
      mode: "edit"
    });

    return redirectWithParams(request, `/admin/listings/${duplicatedListing.id}/edit`, {
      status: "listing_duplicated"
    });
  } catch (error) {
    return redirectWithParams(request, `/admin/listings/${listingId}`, {
      error: listingMutationErrorCode(error)
    });
  }
}
