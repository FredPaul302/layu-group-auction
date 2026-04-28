import type { NextRequest } from "next/server";

import { runInternalJobRoute } from "@/app/api/_utils/internal-jobs";
import { closeExpiredAuctions } from "@/lib/auctions";

export async function POST(request: NextRequest) {
  return runInternalJobRoute(request, {
    jobName: "auctions.closeExpired",
    run: () => closeExpiredAuctions()
  });
}
