import { notImplementedResponse } from "@/app/api/_utils/not-implemented";
import { expireRunnerUpOffers } from "@/lib/auctions";

export async function POST() {
  const result = await expireRunnerUpOffers({ dryRun: true });

  return notImplementedResponse(
    "/api/internal/jobs/expire-runner-up-offers",
    ["POST"],
    result.notes.join(" ")
  );
}
