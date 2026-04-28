import type { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { VerificationActionError } from "@/lib/verification";
import { applyBidderRestrictionFlag, clearBidderRestrictionFlag } from "@/lib/verification/service";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { redirectWithParams } from "@/app/api/_utils/responses";

type BidderFlagRouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: NextRequest, context: BidderFlagRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const adminUser = await requireAdminUser();
  const { userId } = await context.params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (
    action !== "block" &&
    action !== "clear_block" &&
    action !== "mark_non_paying" &&
    action !== "clear_non_paying"
  ) {
    return redirectWithParams(request, `/admin/users/${userId}`, {
      error: "flag_action_invalid"
    });
  }

  try {
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
    } else {
      await clearBidderRestrictionFlag({
        userId,
        flagType: "non_paying"
      });
    }
  } catch (error) {
    if (error instanceof VerificationActionError) {
      return redirectWithParams(request, `/admin/users/${userId}`, {
        error: error.code
      });
    }

    throw error;
  }

  return redirectWithParams(request, `/admin/users/${userId}`, {
    status: "bidder_flag_updated"
  });
}
