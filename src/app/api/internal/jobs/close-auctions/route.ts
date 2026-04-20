import type { NextRequest } from "next/server";

import { notImplementedResponse } from "@/app/api/_utils/not-implemented";
import { requireInternalJobAuthorization } from "@/app/api/_utils/internal-jobs";
import { closeExpiredAuctions } from "@/lib/auctions";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireInternalJobAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const result = await closeExpiredAuctions({ dryRun: true });

  return notImplementedResponse("/api/internal/jobs/close-auctions", ["POST"], result.notes.join(" "));
}
