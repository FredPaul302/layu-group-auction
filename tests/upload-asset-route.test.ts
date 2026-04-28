import { beforeEach, describe, expect, it, vi } from "vitest";

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
    payment: {
      findFirst: vi.fn()
    }
  }
}));

const storageMocks = vi.hoisted(() => ({
  read: vi.fn()
}));

vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => storageMocks)
}));

import { GET } from "../src/app/uploads/[...assetPath]/route.js";

describe("public upload asset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.deposit.findFirst.mockResolvedValue(null);
    prismaMock.prisma.payment.findFirst.mockResolvedValue(null);
    appEnvMocks.getAppEnv.mockReturnValue({
      storage: {
        driver: "local"
      }
    });
  });

  it("serves local assets only when the key belongs to a listing image", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1"
    });
    storageMocks.read.mockResolvedValue({
      key: "listing-image.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("listing-image"),
      sizeBytes: 13
    });

    const response = await GET(new Request("http://localhost/uploads/listing-image.jpg"), {
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
        id: true
      }
    });
    expect(storageMocks.read).toHaveBeenCalledWith("listing-image.jpg");
  });

  it("does not serve private proof keys through public uploads", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/uploads/payment-proof.jpg"), {
      params: Promise.resolve({
        assetPath: ["payment-proof.jpg"]
      })
    });

    expect(response.status).toBe(404);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });

  it("does not serve a key through public uploads when it is attached to a proof record", async () => {
    prismaMock.prisma.listingImage.findFirst.mockResolvedValue({
      id: "image_1"
    });
    prismaMock.prisma.payment.findFirst.mockResolvedValue({
      id: "payment_1"
    });

    const response = await GET(new Request("http://localhost/uploads/shared-key.jpg"), {
      params: Promise.resolve({
        assetPath: ["shared-key.jpg"]
      })
    });

    expect(response.status).toBe(404);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });
});
