import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/app-env", () => ({ getAppEnv: () => ({ app: { url: "https://market.layu.llc" } }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUserFromCookieSource: vi.fn(async () => ({ id: "buyer" })) }));
vi.mock("@/lib/auctions", () => ({ AuctionActionError: class extends Error {}, placeBidOnListing: vi.fn(async () => ({ bid: { id: "bid" }, currentPriceCents: 4000, nextMinimumBidCents: 4100 })) }));
import { redirectWithParams } from "../src/app/api/_utils/responses";
import { POST } from "../src/app/api/listings/[listingId]/bids/route";

describe("commerce redirects behind the hosting proxy", () => {
  it("uses the configured market address for the buyer payment page", () => {
    const response = redirectWithParams(new NextRequest("http://localhost:3000/api/listings/item/claim"), "/account/orders/order/payment", { status: "claim_created" });
    expect(response.headers.get("location")).toBe("https://market.layu.llc/account/orders/order/payment?status=claim_created");
  });
  it("returns a successful bid to the market rather than the internal server address", async () => {
    const form = new FormData(); form.set("amountCents", "4000");
    const response = await POST(new NextRequest("http://localhost:3000/api/listings/item/bids", { method: "POST", headers: { origin: "https://market.layu.llc" }, body: form }), { params: Promise.resolve({ listingId: "item" }) });
    expect(response.headers.get("location")).toBe("https://market.layu.llc/listings/item?bidStatus=placed");
  });
});
