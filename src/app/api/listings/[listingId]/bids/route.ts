import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { canParticipateInCommerce, hasVerifiedEmail } from "@/lib/permissions";

import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookieSource(request.cookies);

  if (!user) {
    return NextResponse.json(
      {
        status: "authentication_required"
      },
      {
        status: 401
      }
    );
  }

  if (!hasVerifiedEmail(user)) {
    return NextResponse.json(
      {
        status: "email_verification_required"
      },
      {
        status: 403
      }
    );
  }

  if (!canParticipateInCommerce(user)) {
    return NextResponse.json(
      {
        status: "secondary_verification_required"
      },
      {
        status: 403
      }
    );
  }

  return notImplementedResponse("/api/listings/[listingId]/bids", ["POST"]);
}
