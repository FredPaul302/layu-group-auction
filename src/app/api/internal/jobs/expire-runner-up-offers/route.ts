import type { NextRequest } from "next/server";

import { requireInternalJobAuthorization } from "@/app/api/_utils/internal-jobs";
import { expireRunnerUpOffers } from "@/lib/auctions";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireInternalJobAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const result = await expireRunnerUpOffers();
  return NextResponse.json(result);
}
