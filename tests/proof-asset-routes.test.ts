import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    deposit: {
      findUnique: vi.fn()
    },
    payment: {
      findUnique: vi.fn()
    }
  }
}));

const storageMocks = vi.hoisted(() => ({
  read: vi.fn()
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => storageMocks)
}));

import { GET as getDepositProof } from "../src/app/api/verifications/deposit/[verificationId]/proof/route.js";
import { GET as getPaymentProof } from "../src/app/api/payments/[paymentId]/proof/route.js";

describe("proof asset routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.read.mockResolvedValue({
      key: "proof.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("proof-image"),
      sizeBytes: 11
    });
  });

  it("allows a payment owner to view their payment proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "buyer_1",
      role: "bidder"
    });
    prismaMock.prisma.payment.findUnique.mockResolvedValue({
      proofAssetKey: "payment-proof.jpg",
      order: {
        buyerUserId: "buyer_1"
      }
    });

    const response = await getPaymentProof(
      new NextRequest("http://localhost/api/payments/pay_1/proof"),
      {
        params: Promise.resolve({
          paymentId: "pay_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(await response.text()).toBe("proof-image");
    expect(storageMocks.read).toHaveBeenCalledWith("payment-proof.jpg");
  });

  it("blocks non-owners from viewing payment proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "buyer_2",
      role: "bidder"
    });
    prismaMock.prisma.payment.findUnique.mockResolvedValue({
      proofAssetKey: "payment-proof.jpg",
      order: {
        buyerUserId: "buyer_1"
      }
    });

    const response = await getPaymentProof(
      new NextRequest("http://localhost/api/payments/pay_1/proof"),
      {
        params: Promise.resolve({
          paymentId: "pay_1"
        })
      }
    );

    expect(response.status).toBe(403);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });

  it("allows admins to view payment proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin"
    });
    prismaMock.prisma.payment.findUnique.mockResolvedValue({
      proofAssetKey: "payment-proof.jpg",
      order: {
        buyerUserId: "buyer_1"
      }
    });

    const response = await getPaymentProof(
      new NextRequest("http://localhost/api/payments/pay_1/proof"),
      {
        params: Promise.resolve({
          paymentId: "pay_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(storageMocks.read).toHaveBeenCalledWith("payment-proof.jpg");
  });

  it("allows a deposit owner to view their deposit proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "buyer_1",
      role: "bidder"
    });
    prismaMock.prisma.deposit.findUnique.mockResolvedValue({
      proofAssetKey: "deposit-proof.jpg",
      userId: "buyer_1"
    });

    const response = await getDepositProof(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/proof"),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("proof-image");
    expect(storageMocks.read).toHaveBeenCalledWith("deposit-proof.jpg");
  });

  it("allows admins to view deposit proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin"
    });
    prismaMock.prisma.deposit.findUnique.mockResolvedValue({
      proofAssetKey: "deposit-proof.jpg",
      userId: "buyer_1"
    });

    const response = await getDepositProof(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/proof"),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(storageMocks.read).toHaveBeenCalledWith("deposit-proof.jpg");
  });

  it("blocks non-owners from viewing deposit proof", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "buyer_2",
      role: "bidder"
    });
    prismaMock.prisma.deposit.findUnique.mockResolvedValue({
      proofAssetKey: "deposit-proof.jpg",
      userId: "buyer_1"
    });

    const response = await getDepositProof(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/proof"),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(403);
    expect(storageMocks.read).not.toHaveBeenCalled();
  });
});
