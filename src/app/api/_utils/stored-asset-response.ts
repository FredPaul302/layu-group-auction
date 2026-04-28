import { NextResponse } from "next/server";

import { getStorageAdapter } from "@/lib/storage";

export async function buildPrivateStoredAssetResponse(key: string) {
  try {
    const storedAsset = await getStorageAdapter().read(key);

    return new NextResponse(new Uint8Array(storedAsset.body), {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Type": storedAsset.contentType
      }
    });
  } catch {
    return new NextResponse("Not found", {
      status: 404
    });
  }
}
