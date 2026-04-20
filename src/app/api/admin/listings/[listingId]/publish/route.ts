import { requireAdminUser } from "@/lib/auth";

import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function POST() {
  await requireAdminUser();
  return notImplementedResponse("/api/admin/listings/[listingId]/publish", ["POST"]);
}
