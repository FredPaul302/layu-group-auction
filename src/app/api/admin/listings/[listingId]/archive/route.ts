import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function POST() {
  return notImplementedResponse("/api/admin/listings/[listingId]/archive", ["POST"]);
}
