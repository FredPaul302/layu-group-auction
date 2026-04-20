import type { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { applyBidderRestrictionFlag, clearBidderRestrictionFlag } from "@/lib/verification/service";

import { redirectWithParams } from "@/app/api/_utils/responses";

type BidderFlagRouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: NextRequest, context: BidderFlagRouteContext) {
  const adminUser = await requireAdminUser();
  const { userId } = await context.params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (action === "block") {
    await applyBidderRestrictionFlag({
      userId,
      flagType: "blocked",
      createdByUserId: adminUser.id,
      reason
    });
  } else if (action === "clear_block") {
    await clearBidderRestrictionFlag({
      userId,
      flagType: "blocked"
    });
  } else if (action === "mark_non_paying") {
    await applyBidderRestrictionFlag({
      userId,
      flagType: "non_paying",
      createdByUserId: adminUser.id,
      reason
    });
  } else if (action === "clear_non_paying") {
    await clearBidderRestrictionFlag({
      userId,
      flagType: "non_paying"
    });
  } else {
    return redirectWithParams(request, `/admin/users/${userId}`, {
      error: "flag_action_invalid"
    });
  }

  return redirectWithParams(request, `/admin/users/${userId}`, {
    status: "bidder_flag_updated"
  });
}
