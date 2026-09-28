import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { exportInventoryCsv } from "@/lib/inventory/rules";
import { listInventory } from "@/lib/inventory/service";

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;

  const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  const items = await listInventory(auth.user.id, search || undefined);

  return new NextResponse(exportInventoryCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="layu-inventory.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
