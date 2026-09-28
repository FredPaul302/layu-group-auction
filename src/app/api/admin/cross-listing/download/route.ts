import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { buildCrossListingJson, buildCrossListingText, buildShopifyDraftCsv } from "@/lib/cross-listing/package";
import { getCrossListingRows, crossListingView } from "@/lib/cross-listing/service";

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  try {
    const ids = request.nextUrl.searchParams.get("ids")?.split(",");
    const format = request.nextUrl.searchParams.get("format") ?? "text";
    const rows = (await getCrossListingRows(auth.user.id, ids)).map(crossListingView);
    if (!rows.length || rows.some((row) => !row.item.ready || row.sourceChanged || row.needsRemoval || row.issues.length)) return NextResponse.json({ message: "Review the current item details and resolve issues before downloading." }, { status: 422 });
    const items = rows.map((row) => row.item);
    const output = format === "shopify" ? buildShopifyDraftCsv(items) : format === "json" ? buildCrossListingJson(items) : items.map(buildCrossListingText).join("\n\n--------------------------------\n\n");
    return new Response(output, { headers: { "Content-Type": format === "shopify" ? "text/csv; charset=utf-8" : format === "json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="layu-listings.${format === "shopify" ? "csv" : format === "json" ? "json" : "txt"}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ message: "The selected records could not be exported. Check the selection and destination." }, { status: 422 }); }
}
