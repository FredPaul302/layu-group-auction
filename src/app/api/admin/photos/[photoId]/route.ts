import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { buildPrivateStoredAssetResponse } from "@/app/api/_utils/stored-asset-response";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { Prisma } from "@prisma/client";
type Context = { params: Promise<{ photoId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const { photoId } = await context.params;
  const photo = await prisma.savedPhoto.findFirst({ where: { id: photoId, sellerUserId: auth.user.id } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return buildPrivateStoredAssetResponse(photo.storageKey);
}

export async function DELETE(request: NextRequest, context: Context) {
  const origin = requireSameOriginRequest(request);
  if (origin) return origin;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const { photoId } = await context.params;
  const photo = await prisma.savedPhoto.findFirst({ where: { id: photoId, sellerUserId: auth.user.id } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  try { await prisma.savedPhoto.deleteMany({ where: { id: photo.id, sellerUserId: auth.user.id } }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return NextResponse.json({ message: "This photo is used in a saved batch. Remove it from that batch or delete the saved batch first." }, { status: 409 });
    throw error;
  }
  // Listing creation stores its own copy, so inbox deletion never removes a listing photo.
  await getStorageAdapter().remove(photo.storageKey).catch(() => console.warn("Unused inbox asset could not be removed", { photoId }));
  return NextResponse.json({ deleted: true });
}
