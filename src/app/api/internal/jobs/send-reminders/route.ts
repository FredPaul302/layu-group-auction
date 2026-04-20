import type { NextRequest } from "next/server";

import { requireInternalJobAuthorization } from "@/app/api/_utils/internal-jobs";
import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireInternalJobAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return notImplementedResponse("/api/internal/jobs/send-reminders", ["POST"]);
}
