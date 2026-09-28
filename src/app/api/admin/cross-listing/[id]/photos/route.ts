import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage/server";
import { photoZip } from "@/lib/cross-listing/photo-archive";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  const { id } = await context.params;
  const record = await prisma.crossListing.findFirst({ where: { id, sellerUserId: auth.user.id }, select: { listing: { select: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 8 } } } } });
  if (!record?.listing?.images.length) return NextResponse.json({ message: "No photos available." }, { status: 404 });
  const storage = getStorageAdapter();
  const iterator = photoZip(record.listing.images.map((photo, index) => ({ name: `${String(index + 1).padStart(2, "0")}-photo${photo.storageKey.match(/\.(?:jpe?g|png|webp|avif|gif)$/i)?.[0] ?? ".jpg"}`, read: async () => (await storage.read(photo.storageKey)).body })));
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); } catch { controller.error(new Error("Photo download interrupted. Try again.")); } },
    async cancel() { await iterator.return(undefined); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="layu-item-photos.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
