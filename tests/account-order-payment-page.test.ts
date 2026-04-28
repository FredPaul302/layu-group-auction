import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn()
}));

const orderMocks = vi.hoisted(() => ({
  getAccountOrderById: vi.fn()
}));

const paymentMocks = vi.hoisted(() => ({
  listEnabledManualPaymentMethods: vi.fn()
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/payments", () => paymentMocks);
vi.mock("@/lib/orders", async () => {
  const actual = await vi.importActual("../src/lib/orders/index.js");

  return {
    ...actual,
    getAccountOrderById: orderMocks.getAccountOrderById
  };
});

import AccountOrderPaymentPage from "../src/app/(account)/account/orders/[orderId]/payment/page.js";

describe("account order payment page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthorized users by returning not found for orders they do not own", async () => {
    authMocks.requireAuthenticatedUser.mockResolvedValue({
      id: "buyer_2",
      role: "bidder",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });
    orderMocks.getAccountOrderById.mockRejectedValue(new Error("Missing order"));
    paymentMocks.listEnabledManualPaymentMethods.mockResolvedValue([]);

    await expect(
      AccountOrderPaymentPage({
        params: Promise.resolve({
          orderId: "order_1"
        }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("NOT_FOUND");

    expect(orderMocks.getAccountOrderById).toHaveBeenCalledWith({
      orderId: "order_1",
      userId: "buyer_2"
    });
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(1);
  });
});
