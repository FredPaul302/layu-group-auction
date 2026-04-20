import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function POST() {
  return notImplementedResponse("/api/admin/listings/[listingId]/runner-up-offer", ["POST"]);
}
