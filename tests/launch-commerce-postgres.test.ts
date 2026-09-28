import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.prisma; } }));
vi.mock("@/lib/notifications/workflow-events", () => ({
  sendFixedPriceReservationCreatedNotification: vi.fn(), sendOrderCompletedNotification: vi.fn(),
  sendOrderPaidNotification: vi.fn(), sendOrderReadyForFulfillmentNotification: vi.fn(),
  sendAuctionWonPaymentInstructionsNotification: vi.fn(), sendOrderPaymentOverdueNotification: vi.fn(),
  sendFixedPriceReservationReleasedNotification: vi.fn()
}));
import { claimFixedPriceListing, updateOrderStatusByAdmin } from "../src/lib/orders/service";
import { placeBidOnListing } from "../src/lib/auctions/service";
import { closeExpiredAuctions } from "../src/lib/auctions/close-expired-auctions";
import { expireOverdueOrders } from "../src/lib/orders/expire-overdue-orders";

const container = process.env.LAUNCH_POSTGRES_CONTAINER;
const database = `layu_launch_test_${Date.now()}_${process.pid}`;
let created = false;
async function sql(statement: string, target = database) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container!, "psql", "-X", "-U", "auction", "-d", target, "-v", "ON_ERROR_STOP=1", "-f", "-"], { windowsHide: true });
    let error = "";
    child.stdout.resume();
    child.stderr.on("data", (data) => { error += String(data); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error)));
    child.stdin.end(statement);
  });
}
let sequence = 0;
async function listing() {
  return state.prisma.listing.create({ data: {
    sellerUserId: "seller", categoryId: "category", listingType: "auction", status: "published",
    slug: `combined-${++sequence}`, title: "Test combined listing", fixedPriceCents: 10000,
    fulfillmentMode: "pickup_only", auction: { create: { startingBidCents: 1000,
      minimumIncrementCents: 100, endAtUtc: new Date(Date.now() + 3600000) } }
  }, include: { auction: true } });
}

// Opt-in only: a new temporary database in local Docker, never production data.
describe.skipIf(!container)("launch commerce in PostgreSQL", () => {
  beforeAll(async () => {
    await sql(`CREATE DATABASE ${database}`, "postgres");
    created = true;
    const root = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql(await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"));
    }
    // Credentials and port are the public local-development values in docker-compose.yml.
    state.prisma = new PrismaClient({ datasourceUrl: `postgresql://auction:auction@127.0.0.1:5433/${database}` });
    await state.prisma.user.createMany({ data: ["seller", "buyer1", "buyer2"].map((id) => ({ id, email: `${id}@example.test`, normalizedEmail: `${id}@example.test`, emailVerifiedAtUtc: new Date() })) });
    await state.prisma.category.create({ data: { id: "category", slug: "test", name: "Test", requiredBidTier: "full" } });
    await state.prisma.siteSetting.create({ data: { id: 1, sellerDisplayName: "Test", supportEmail: "support@example.test" } });
  }, 60000);
  afterAll(async () => {
    await state.prisma?.$disconnect();
    if (created) await sql(`DROP DATABASE ${database}`, "postgres");
  });

  it("reserves a combined listing without a deposit, ends bidding, and creates one order on retry", async () => {
    const item = await listing();
    await placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 3000 });
    const order = await claimFixedPriceListing({ listingId: item.id, buyerUserId: "buyer1" });
    expect(order.subtotalCents).toBe(10000);
    expect((await claimFixedPriceListing({ listingId: item.id, buyerUserId: "buyer1" })).id).toBe(order.id);
    expect(await state.prisma.order.count({ where: { listingId: item.id } })).toBe(1);
    expect((await state.prisma.auction.findUniqueOrThrow({ where: { listingId: item.id } })).status).toBe("ended");
    expect(await state.prisma.bid.count({ where: { auctionId: item.auction!.id, isWinning: true } })).toBe(0);
    await expect(placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 3100 })).rejects.toMatchObject({ code: "listing_not_biddable" });
  });
  it("allows only one of two simultaneous buyers to reserve", async () => {
    const item = await listing();
    const outcomes = await Promise.allSettled(["buyer1", "buyer2"].map((buyerUserId) => claimFixedPriceListing({ listingId: item.id, buyerUserId })));
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await state.prisma.order.count({ where: { listingId: item.id } })).toBe(1);
  });
  it("serializes a simultaneous bid and purchase without a winning bid after purchase", async () => {
    const item = await listing();
    const results = await Promise.allSettled([
      claimFixedPriceListing({ listingId: item.id, buyerUserId: "buyer1" }),
      placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 3000 })
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(await state.prisma.order.count({ where: { listingId: item.id } })).toBe(1);
    expect(await state.prisma.bid.count({ where: { auctionId: item.auction!.id, isWinning: true } })).toBe(0);
    await closeExpiredAuctions({ now: new Date(Date.now() + 7200000) });
    expect(await state.prisma.order.count({ where: { listingId: item.id } })).toBe(1);
  });
  it("enforces the actual submitted amount and approved hold at the database boundary", async () => {
    const item = await listing();
    await placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 4000 });
    await expect(placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 4100 })).rejects.toMatchObject({ code: "secondary_verification_required" });
    await state.prisma.bidderProfile.create({ data: { userId: "buyer2", maxBidTier: "tier_1", activeHoldAmountCents: 100 } });
    await placeBidOnListing({ listingId: item.id, bidderUserId: "buyer2", amountCents: 4100 });
    expect((await state.prisma.auction.findUniqueOrThrow({ where: { listingId: item.id } })).currentHighestBidCents).toBe(4100);
  });
  it("leaves expired combined reservations closed for manual relisting", async () => {
    const item = await listing();
    const order = await claimFixedPriceListing({ listingId: item.id, buyerUserId: "buyer1" });
    await expireOverdueOrders({ now: new Date(order.paymentDeadlineAtUtc.getTime() + 1) });
    expect((await state.prisma.listing.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("unsold");
    expect((await state.prisma.auction.findUniqueOrThrow({ where: { listingId: item.id } })).status).toBe("ended");
    expect(await state.prisma.order.count({ where: { listingId: item.id, source: "auction_win" } })).toBe(0);
  });
  it("leaves cancelled combined reservations closed", async () => {
    const item = await listing();
    const order = await claimFixedPriceListing({ listingId: item.id, buyerUserId: "buyer1" });
    await updateOrderStatusByAdmin({ orderId: order.id, action: "mark_cancelled" });
    expect((await state.prisma.listing.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("unsold");
  });
});
