import { NextRequest, NextResponse } from "next/server";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { requireAdminRequestUser } from "@/app/api/_utils/require-admin-request-user";
import { saveWorkspaceAsset } from "@/lib/catalog/bulk-workspace-service";
import { WorkspaceDraftError } from "@/lib/catalog/bulk-workspace-draft";
import { bulkListingVideoMaxSizeBytes } from "@/lib/catalog/bulk-listings";
import { readMultipartUpload, MultipartUploadError } from "@/lib/storage/multipart-upload";
export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const origin = requireSameOriginRequest(request); if (origin) return origin;
  const auth = await requireAdminRequestUser(request); if (auth.response) return auth.response;
  let upload: Awaited<ReturnType<typeof readMultipartUpload>> | undefined;
  try {
    const { workspaceId } = await context.params;
    upload = await readMultipartUpload(request, { bodyBytes: bulkListingVideoMaxSizeBytes + 1024 * 1024, fileBytes: bulkListingVideoMaxSizeBytes, files: 1 });
    const file = upload.formData.get("file"), id = upload.formData.get("id");
    if (!(file instanceof File) || typeof id !== "string") throw new WorkspaceDraftError("Select a photo or video to save.");
    const asset = await saveWorkspaceAsset(auth.user.id, workspaceId, id, file);
    return NextResponse.json({ asset: { id: asset.id } });
  } catch (error) {
    if (error instanceof WorkspaceDraftError || error instanceof MultipartUploadError) return NextResponse.json({ message: error.message }, { status: error.status });
    return NextResponse.json({ message: "Could not save this attachment. Keep this tab open and retry." }, { status: 500 });
  } finally { await upload?.cleanup(); }
}
