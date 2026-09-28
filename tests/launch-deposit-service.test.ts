import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prisma: {
  siteSetting: { findUnique: vi.fn() }, sitePaymentMethod: { findFirst: vi.fn() },
  deposit: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() }
} }));
vi.mock("@/lib/prisma", () => mocks);
import { createDepositDraft } from "../src/lib/verification/service";

describe("launch deposit requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.siteSetting.findUnique.mockResolvedValue({ launchAccessEnabled: true, verificationLevel: 3, emailOnlyLimitCents: 10000 });
    mocks.prisma.sitePaymentMethod.findFirst.mockResolvedValue({ id: "method" });
    mocks.prisma.deposit.findUnique.mockResolvedValue(null);
    mocks.prisma.deposit.findFirst.mockResolvedValue(null);
    mocks.prisma.deposit.create.mockResolvedValue({ id: "deposit" });
  });
  it("creates a $1 manual-review draft", async () => {
    await createDepositDraft({ userId: "buyer", amountCents: 100, paymentMethodCode: "paypal" });
    expect(mocks.prisma.deposit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 100, status: "draft" }) }));
  });
  it.each([500, 1000, 2000, 100.5])("rejects new deposit amount %s while launch access is active", async (amountCents) => {
    await expect(createDepositDraft({ userId: "buyer", amountCents, paymentMethodCode: "paypal" })).rejects.toMatchObject({ code: "deposit_amount_invalid" });
    expect(mocks.prisma.deposit.create).not.toHaveBeenCalled();
  });
  it("makes the $20 tier available only after launch access is disabled", async () => {
    mocks.prisma.siteSetting.findUnique.mockResolvedValue({ launchAccessEnabled: false });
    await createDepositDraft({ userId: "buyer", amountCents: 2000, paymentMethodCode: "paypal" });
    expect(mocks.prisma.deposit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 2000 }) }));
  });
  it("uses updated tier amounts for new deposits without altering historical records", async () => {
    mocks.prisma.siteSetting.findUnique.mockResolvedValue({ launchAccessEnabled: true, depositTier1Cents: 250, depositTier2Cents: 2550, launchAuctionLimitCents: 5050 });
    await expect(createDepositDraft({ userId: "buyer", amountCents: 100, paymentMethodCode: "paypal" })).rejects.toMatchObject({ code: "deposit_amount_invalid" });
    await createDepositDraft({ userId: "buyer", amountCents: 250, paymentMethodCode: "paypal" });
    expect(mocks.prisma.deposit.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.deposit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 250 }) }));
    await expect(createDepositDraft({ userId: "buyer", amountCents: 2550, paymentMethodCode: "paypal" })).rejects.toMatchObject({ code: "deposit_amount_invalid" });
  });
});
