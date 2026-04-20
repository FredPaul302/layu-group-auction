import type { NextRequest } from "next/server";

import { requireInternalJobAuthorization } from "@/app/api/_utils/internal-jobs";
import { expireOverdueOrders } from "@/lib/orders";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireInternalJobAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const result = await expireOverdueOrders();
  return NextResponse.json(result);
}
