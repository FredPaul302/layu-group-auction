import type { NextRequest } from "next/server";

import { archiveListing } from "@/lib/catalog/service";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";

type ArchiveRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: ArchiveRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const auth = await requireAdminRequestUser(request);

  if (auth.response) {
    return auth.response;
  }

  const { listingId } = await context.params;

  await archiveListing(listingId);

  return redirectWithParams(request, "/admin/listings", {
    status: "listing_archived"
  });
}
