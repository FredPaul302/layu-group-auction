import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getAppEnv } from "@/lib/config/app-env";

const contentTypeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

type UploadAssetRouteProps = {
  params: Promise<{
    assetPath: string[];
  }>;
};

export async function GET(_: Request, { params }: UploadAssetRouteProps) {
  const { assetPath } = await params;
  const env = getAppEnv();
  const rootDirectory = path.resolve(process.cwd(), env.localUploadDir);
  const resolvedPath = path.resolve(rootDirectory, ...assetPath);

  if (!resolvedPath.startsWith(rootDirectory)) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  try {
    const body = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": contentTypeByExtension[extension] ?? "application/octet-stream"
      }
    });
  } catch {
    return new NextResponse("Not found", {
      status: 404
    });
  }
}
