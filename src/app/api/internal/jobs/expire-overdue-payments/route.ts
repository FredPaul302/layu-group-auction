import type { NextRequest } from "next/server";

import { runInternalJobRoute } from "@/app/api/_utils/internal-jobs";
import { expireOverdueOrders } from "@/lib/orders";

export async function POST(request: NextRequest) {
  return runInternalJobRoute(request, {
    jobName: "orders.expireOverdue",
    run: () => expireOverdueOrders()
  });
}
