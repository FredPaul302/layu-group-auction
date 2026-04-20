import { notImplementedResponse } from "@/app/api/_utils/not-implemented";
import { expireOverdueOrders } from "@/lib/orders";

export async function POST() {
  const result = await expireOverdueOrders({ dryRun: true });

  return notImplementedResponse(
    "/api/internal/jobs/expire-overdue-payments",
    ["POST"],
    result.notes.join(" ")
  );
}
