import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), bid: vi.fn(), payment: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: mocks.auth }));
vi.mock("@/lib/auctions", () => ({ placeBidOnListing: mocks.bid, AuctionActionError: class extends Error {} }));
vi.mock("@/lib/payments", () => ({ submitOrderPayment: mocks.payment }));
vi.mock("@/lib/orders", () => ({ OrderActionError: class extends Error {} }));
import { POST as bid } from "../src/app/api/listings/[listingId]/bids/route";
import { POST as payment } from "../src/app/api/payments/route";

function request(path: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`http://localhost:3000${path}`, { method: "POST", headers: { origin: "http://localhost:3000" }, body: form });
}

describe("dollar amounts at buyer form boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "buyer" });
    mocks.bid.mockResolvedValue({ bid: { id: "bid" }, currentPriceCents: 1250, nextMinimumBidCents: 1350 });
    mocks.payment.mockResolvedValue({ id: "payment", orderId: "order" });
  });
  it("submits a $12.50 bid as 1250 cents", async () => {
    expect((await bid(request("/api/listings/item/bids", { amount: "12.50" }), { params: Promise.resolve({ listingId: "item" }) })).status).toBe(303);
    expect(mocks.bid).toHaveBeenCalledWith({ listingId: "item", bidderUserId: "buyer", amountCents: 1250 });
  });
  it("submits a $19.99 payment as 1999 cents", async () => {
    expect((await payment(request("/api/payments", { amount: "19.99", orderId: "order", paymentMethodId: "method", payerHandle: "buyer", externalReference: "test-reference" }))).status).toBe(303);
    expect(mocks.payment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1999, orderId: "order" }));
  });
  it("keeps a still-open older cent form from being multiplied by 100", async () => {
    await bid(request("/api/listings/item/bids", { amountCents: "1250" }), { params: Promise.resolve({ listingId: "item" }) });
    expect(mocks.bid).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1250 }));
  });
  it("never rounds malformed dollar input into a valid monetary amount", async () => {
    await payment(request("/api/payments", { amount: "19.999", amountCents: "2000", orderId: "order" }));
    expect(mocks.payment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: Number.NaN }));
  });
});
