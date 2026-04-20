import type { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { archiveListing } from "@/lib/catalog/service";

import { redirectWithParams } from "@/app/api/_utils/responses";

type ArchiveRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: ArchiveRouteContext) {
  await requireAdminUser();
  const { listingId } = await context.params;

  await archiveListing(listingId);

  return redirectWithParams(request, "/admin/listings", {
    status: "listing_archived"
  });
}
