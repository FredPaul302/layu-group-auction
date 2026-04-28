import { NextResponse } from "next/server";

import { getAppEnv } from "@/lib/config/app-env";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";

type UploadAssetRouteProps = {
  params: Promise<{
    assetPath: string[];
  }>;
};

export async function GET(_: Request, { params }: UploadAssetRouteProps) {
  const { assetPath } = await params;
  const env = getAppEnv();
  const assetKey = assetPath.join("/");

  if (env.storage.driver !== "local") {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  if (!assetKey || assetPath.some((segment) => !segment || segment === "." || segment === "..")) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  const [listingImage, paymentProof, depositProof] = await Promise.all([
    prisma.listingImage.findFirst({
      where: {
        storageKey: assetKey
      },
      select: {
        id: true
      }
    }),
    prisma.payment.findFirst({
      where: {
        proofAssetKey: assetKey
      },
      select: {
        id: true
      }
    }),
    prisma.deposit.findFirst({
      where: {
        proofAssetKey: assetKey
      },
      select: {
        id: true
      }
    })
  ]);

  if (!listingImage || paymentProof || depositProof) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  try {
    const storedAsset = await getStorageAdapter().read(assetKey);

    return new NextResponse(new Uint8Array(storedAsset.body), {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": storedAsset.contentType
      }
    });
  } catch {
    return new NextResponse("Not found", {
      status: 404
    });
  }
}
