import { notImplementedResponse } from "@/app/api/_utils/not-implemented";
import { closeExpiredAuctions } from "@/lib/auctions";

export async function POST() {
  const result = await closeExpiredAuctions({ dryRun: true });

  return notImplementedResponse("/api/internal/jobs/close-auctions", ["POST"], result.notes.join(" "));
}
