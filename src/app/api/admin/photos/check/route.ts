import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { prisma } from "@/lib/prisma";
import { savedPhotoSelect } from "@/lib/catalog/photo-inbox-select";
import { photoInboxMaxCount } from "@/lib/catalog/photo-inbox-validation";

export async function POST(request: NextRequest) {
  const origin = requireSameOriginRequest(request);
  if (origin) return origin;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  // Bound the body even when Content-Length is absent or inaccurate.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ message: "Choose photos to check." }, { status: 422 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return NextResponse.json({ message: "Choose up to 100 photos at a time." }, { status: 413 }); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(data?.hashes) || !data.hashes.length || data.hashes.length > photoInboxMaxCount || data.hashes.some((hash: unknown) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
      return NextResponse.json({ message: "Photo checks could not be read. Select the photos again." }, { status: 422 });
    }
    const photos = await prisma.savedPhoto.findMany({ where: { sellerUserId: auth.user.id, contentHash: { in: [...new Set<string>(data.hashes)] } }, orderBy: [{ createdAtUtc: "asc" }, { id: "asc" }], select: savedPhotoSelect });
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Photo checks could not be read. Select the photos again." }, { status: 422 });
    console.error("Photo duplicate check failed", error);
    return NextResponse.json({ message: "Could not check your inbox. Try again before uploading." }, { status: 500 });
  } finally { reader.releaseLock(); }
}
