import type { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { relistListing, type RelistMode } from "@/lib/catalog/relist";

import { redirectWithParams } from "@/app/api/_utils/responses";

type RelistRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: NextRequest, context: RelistRouteContext) {
  await requireAdminUser();
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
