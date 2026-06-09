import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";

type UploadAssetRouteProps = {
  params: Promise<{
    assetPath: string[];
  }>;
};

function isPublicListingMediaStatus(status: string) {
  return status !== "draft" && status !== "archived";
}

export async function GET(request: NextRequest, { params }: UploadAssetRouteProps) {
  const { assetPath } = await params;
  const assetKey = assetPath.join("/");

  if (!assetKey || assetPath.some((segment) => !segment || segment === "." || segment === "..")) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  const [listingImage, listingVideo, paymentProof, depositProof] = await Promise.all([
    prisma.listingImage.findFirst({
      where: {
        storageKey: assetKey
      },
      select: {
        id: true,
        listing: {
          select: {
            status: true
          }
        }
      }
    }),
    prisma.listingVideo.findFirst({
      where: {
        storageKey: assetKey
      },
      select: {
        id: true,
        listing: {
          select: {
            status: true
          }
        }
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

  const listingMedia = listingImage ?? listingVideo;

  if (!listingMedia || paymentProof || depositProof) {
    return new NextResponse("Not found", {
      status: 404
    });
  }

  const isPublicMedia = isPublicListingMediaStatus(listingMedia.listing.status);
  if (!isPublicMedia) {
    const user = await getCurrentUserFromCookieSource(request.cookies);

    if (!isAdmin(user)) {
      return new NextResponse("Not found", {
        status: 404
      });
    }
  }

  try {
    const storedAsset = await getStorageAdapter().read(assetKey);

    return new NextResponse(new Uint8Array(storedAsset.body), {
      headers: {
        "Cache-Control": isPublicMedia ? "public, max-age=60" : "private, max-age=60",
        "Content-Type": storedAsset.contentType
      }
    });
  } catch {
    return new NextResponse("Not found", {
      status: 404
    });
  }
}
