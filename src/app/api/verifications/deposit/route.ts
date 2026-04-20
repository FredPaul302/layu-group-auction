import { PaymentMethodCode } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { createDepositDraft, submitDepositForReview } from "@/lib/verification/service";

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

function isPaymentMethodCode(value: string): value is PaymentMethodCode {
  return Object.values(PaymentMethodCode).includes(value as PaymentMethodCode);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return redirectTo(request, "/auth/login");
  }

  if (!hasVerifiedEmail(user)) {
    return redirectTo(request, "/auth/verify-email", {
      status: "required"
    });
  }

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");

  if (action === "create_intent") {
    const amountCents = Number.parseInt(String(formData.get("amountCents") ?? ""), 10);
    const paymentMethodCode = String(formData.get("paymentMethodCode") ?? "");

    if (!Number.isFinite(amountCents)) {
      return redirectTo(request, "/account/verification/deposit", {
        status: "invalid_amount"
      });
    }

    if (!isPaymentMethodCode(paymentMethodCode)) {
      return redirectTo(request, "/account/verification/deposit", {
        status: "invalid_method"
      });
    }

    try {
      await createDepositDraft({
        userId: user.id,
        amountCents,
        paymentMethodCode
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("tier")) {
        return redirectTo(request, "/account/verification/deposit", {
          status: "invalid_amount"
        });
      }

      return redirectTo(request, "/account/verification/deposit", {
        status: "invalid_method"
      });
    }

    return redirectTo(request, "/account/verification/deposit", {
      status: "created"
    });
  }

  if (action === "submit") {
    const depositId = String(formData.get("depositId") ?? "");
    const payerHandle = String(formData.get("payerHandle") ?? "").trim();
    const externalReference = String(formData.get("externalReference") ?? "").trim();
    const screenshotEntry = formData.get("screenshot");
    const screenshotFile = screenshotEntry instanceof File ? screenshotEntry : null;

    if (!depositId || !payerHandle || !externalReference) {
      return redirectTo(request, "/account/verification/deposit", {
        status: "submission_missing"
      });
    }

    try {
      await submitDepositForReview({
        depositId,
        userId: user.id,
        payerHandle,
        externalReference,
        screenshotFile
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("image")) {
        return redirectTo(request, "/account/verification/deposit", {
          status: "invalid_screenshot"
        });
      }

      return redirectTo(request, "/account/verification/deposit", {
        status: "submission_missing"
      });
    }

    return redirectTo(request, "/account/verification/deposit", {
      status: "submitted"
    });
  }

  return redirectTo(request, "/account/verification/deposit");
}
