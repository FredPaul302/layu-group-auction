import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { prisma } from "@/lib/prisma";
import { saveInboxPhotos } from "@/lib/catalog/photo-inbox";
import { savedPhotoSelect } from "@/lib/catalog/photo-inbox-select";
import { CatalogValidationError } from "@/lib/catalog";
import { bulkListingMaxBodySizeBytes, bulkListingMaxRequestSizeBytes } from "@/lib/catalog/bulk-listings";
import { validateInboxTransfer } from "@/lib/catalog/photo-inbox-validation";
import { readMultipartUpload, MultipartUploadError } from "@/lib/storage/multipart-upload";

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const photos = await prisma.savedPhoto.findMany({ where: { sellerUserId: auth.user.id }, orderBy: [{ createdAtUtc: "desc" }, { id: "desc" }],
    select: savedPhotoSelect });
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = requireSameOriginRequest(request);
  if (origin) return origin;
  const auth = await requireAdminRequestUser(request);
  if (auth.response) return auth.response;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(length) || length < 0 || length > bulkListingMaxBodySizeBytes) return NextResponse.json({ code: "photos_too_large", message: `Upload up to ${bulkListingMaxRequestSizeBytes / (1024 * 1024)} MB at a time.` }, { status: 413 });
  let upload: Awaited<ReturnType<typeof readMultipartUpload>> | undefined;
  try {
    upload = await readMultipartUpload(request, { bodyBytes: bulkListingMaxBodySizeBytes, fileBytes: 50 * 1024 * 1024, files: 100 });
    const data = upload.formData;
    const files = data.getAll("photos").filter((file): file is File => file instanceof File);
    validateInboxTransfer(files, data.get("photoManifest"));
    const manifest = typeof data.get("photoManifest") === "string" ? JSON.parse(data.get("photoManifest") as string) : [];
    const timeZone = typeof data.get("sourceTimeZone") === "string" ? (data.get("sourceTimeZone") as string).slice(0, 100) : undefined;
    const photos = await saveInboxPhotos(auth.user.id, files, files.map((_, index) => ({ lastModified: manifest[index]?.lastModified, timeZone })));
    return NextResponse.json({ photos, message: `${photos.length} photos saved to your inbox. Sign in with the same account on your computer to use them.` });
  } catch (error) {
    if (error instanceof MultipartUploadError) return NextResponse.json({ code: error.code === "upload_incomplete" ? "photo_transfer_incomplete" : error.code, message: error.message }, { status: error.status });
    if (error instanceof CatalogValidationError) return NextResponse.json({ code: error.code, message: error.message }, { status: 422 });
    console.error("Photo inbox upload failed", error);
    return NextResponse.json({ message: "Photos could not be saved. Check the inbox before retrying." }, { status: 500 });
  } finally { await upload?.cleanup(); }
}
