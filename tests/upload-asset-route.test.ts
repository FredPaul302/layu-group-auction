import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const appEnvMocks = vi.hoisted(() => ({
  getAppEnv: vi.fn(() => ({
    storage: {
      driver: "local"
    }
  }))
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    deposit: {
      findFirst: vi.fn()
    },
    listingImage: {
      findFirst: vi.fn()
    },
    listingVideo: {
      findFirst: vi.fn()
    },
    payment: {
      findFirst: vi.fn()
    }
  }
}));

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const storageMocks = vi.hoisted(() => ({
  read: vi.fn()
}));

vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => storageMocks)
}));

import { GET } from "../src/app/uploads/[...assetPath]/route.js";

function buildRequest(url: string) {
  return new NextRequest(url);
}

describe("public upload asset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.deposit.findFirst.mockResolvedValue(null);
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue(null);
    prismaMock.prisma.listingVideo.findFirst.mockResolvedValue(null);
    prismaMock.prisma.payment.findFirst.mockResolvedValue(null);
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(null);
    appEnvMocks.getAppEnv.mockReturnValue({
      storage: {
        driver: "local"
      }
    });
  });

  it("serves local assets only when the key belongs to a listing image", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1",
      listing: {
        status: "published"
      }
    });
    storageMocks.read.mockResolvedValue({
      key: "listing-image.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("listing-image"),
      sizeBytes: 13
    });

    const response = await GET(buildRequest("http://localhost/uploads/listing-image.jpg"), {
      params: Promise.resolve({
        assetPath: ["listing-image.jpg"]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await response.text()).toBe("listing-image");
    expect(prismaMock.prisma.listingImage.findFirst).toHaveBeenCalledWith({
      where: {
        storageKey: "listing-image.jpg"
      },
      select: {
        id: true,
        listing: {
          select: {
            status: true
          }
        }
      }
    });
    expect(storageMocks.read).toHaveBeenCalledWith("listing-image.jpg");
  });

  it("serves listing videos through the controlled route", async () => {
    prismaMock.prisma.listingVideo.findFirst.mockResolvedValue({
      id: "video_1",
      listing: {
        status: "published"
      }
    });
    storageMocks.read.mockResolvedValue({
      key: "listing-video.mp4",
      contentType: "video/mp4",
      body: Buffer.from("listing-video"),
      sizeBytes: 13
    });

    const response = await GET(buildRequest("http://localhost/uploads/listing-video.mp4"), {
      params: Promise.resolve({
        assetPath: ["listing-video.mp4"]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("listing-video");
  });

  it("does not expose draft listing media to public requests", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1",
      listing: {
        status: "draft"
      }
    });

    const response = await GET(buildRequest("http://localhost/uploads/draft-image.jpg"), {
      params: Promise.resolve({
        assetPath: ["draft-image.jpg"]
      })
    });

    expect(response.status).toBe(404);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });

  it("serves draft listing media to admins", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1",
      listing: {
        status: "draft"
      }
    });
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin"
    });
    storageMocks.read.mockResolvedValue({
      key: "draft-image.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("draft-image"),
      sizeBytes: 11
    });

    const response = await GET(buildRequest("http://localhost/uploads/draft-image.jpg"), {
      params: Promise.resolve({
        assetPath: ["draft-image.jpg"]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("does not serve private proof keys through public uploads", async () => {
    const response = await GET(buildRequest("http://localhost/uploads/payment-proof.jpg"), {
      params: Promise.resolve({
        assetPath: ["payment-proof.jpg"]
      })
    });

    expect(response.status).toBe(404);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });

  it("does not serve a key through public uploads when it is attached to a proof record", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1",
      listing: {
        status: "published"
      }
    });
    prismaMock.prisma.payment.findFirst.mockResolvedValue({
      id: "payment_1"
    });

    const response = await GET(buildRequest("http://localhost/uploads/shared-key.jpg"), {
      params: Promise.resolve({
        assetPath: ["shared-key.jpg"]
      })
    });

    expect(response.status).toBe(404);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });
});
