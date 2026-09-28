import type { NextRequest } from "next/server";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { redirectWithParams } from "@/app/api/_utils/responses";
import { VerificationPolicyInputError } from "@/lib/verification/policy";
import { updateVerificationPolicy } from "@/lib/verification/policy-service";
import { dollarsToCents } from "@/lib/money";

export async function POST(request: NextRequest) {
  const originResponse = requireSameOriginRequest(request);
  if (originResponse) return originResponse;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;

  const form = await request.formData();
  try {
    const emailOnlyLimitCents = dollarsToCents(form.get("emailOnlyLimit"));
    if (!Number.isFinite(emailOnlyLimitCents)) {
      throw new VerificationPolicyInputError("Enter a limit in dollars, with at most two decimal places.");
    }
    await updateVerificationPolicy({
      launchAccessEnabled: form.get("launchAccessEnabled"),
      homepageVideoUrl: form.has("homepageVideoUrl") ? form.get("homepageVideoUrl") : undefined,
      verificationLevel: form.get("verificationLevel"),
      emailOnlyLimitCents,
      ...(form.has("depositTier1") || form.has("depositTier2") || form.has("launchAuctionLimit") ? {
        depositTier1Cents: dollarsToCents(form.get("depositTier1")),
        depositTier2Cents: dollarsToCents(form.get("depositTier2")),
        launchAuctionLimitCents: dollarsToCents(form.get("launchAuctionLimit"))
      } : {})
    });
    return redirectWithParams(request, "/admin/settings/verification", { status: "saved" });
  } catch (error) {
    if (error instanceof VerificationPolicyInputError) {
      return redirectWithParams(request, "/admin/settings/verification", { error: error.message });
    }
    throw error;
  }
}
