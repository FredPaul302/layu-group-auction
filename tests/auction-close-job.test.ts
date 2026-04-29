import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    auction: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

const notificationMocks = vi.hoisted(() => ({
  sendAuctionWonPaymentInstructionsNotification: vi.fn()
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/notifications/workflow-events", () => notificationMocks);

import { closeExpiredAuctions } from "../src/lib/auctions/index.js";

type FakeState = {
  auction: {
    id: string;
    listingId: string;
    status: string;
    endAtUtc: Date;
    currentHighestBidCents: number | null;
    currentHighestBidderId: string | null;
    closedAtUtc: Date | null;
  };
  listing: {
    id: string;
    title: string;
    status: string;
    shippingFeeCents: number;
    fulfillmentMode: "pickup_only" | "shipping_only" | "pickup_or_shipping";
  };
  bids: Array<{
    id: string;
    bidderUserId: string;
    bidderEmail: string;
    amountCents: number;
    placedAtUtc: Date;
    status: string;
    isWinning: boolean;
  }>;
  orders: Array<{
    id: string;
    listingId: string;
    buyerUserId: string;
    source: string;
    status: string;
    winningBidId: string | null;
    paymentDeadlineAtUtc: Date;
  }>;
};

type FindExpiredAuctionCandidatesArgs = {
  where?: {
    endAtUtc?: {
      lt?: Date;
      lte?: Date;
    };
  };
};

function buildState(): FakeState {
  return {
    auction: {
      id: "auction_1",
      listingId: "listing_1",
      status: "live",
      endAtUtc: new Date("2026-04-24T11:00:00.000Z"),
      currentHighestBidCents: null,
      currentHighestBidderId: null,
      closedAtUtc: null
    },
    listing: {
      id: "listing_1",
      title: "Rare arcade flyer set",
      status: "published",
      shippingFeeCents: 1_000,
      fulfillmentMode: "shipping_only"
    },
    bids: [
      {
        id: "bid_1",
        bidderUserId: "buyer_1",
        bidderEmail: "winner@example.com",
        amountCents: 8_500,
        placedAtUtc: new Date("2026-04-24T10:30:00.000Z"),
        status: "active",
        isWinning: false
      }
    ],
    orders: []
  };
}

function buildCandidate(state: FakeState) {
  return {
    id: state.auction.id,
    status: state.auction.status,
    endAtUtc: state.auction.endAtUtc,
    listingId: state.auction.listingId,
    listing: {
      id: state.listing.id,
      title: state.listing.title,
      status: state.listing.status,
      shippingFeeCents: state.listing.shippingFeeCents,
      fulfillmentMode: state.listing.fulfillmentMode,
      orders: state.orders
        .filter((order) => order.source === "auction_win")
        .slice(0, 1)
        .map((order) => ({
          id: order.id
        }))
    },
    bids: state.bids.map((bid) => ({
      id: bid.id,
      bidderUserId: bid.bidderUserId,
      bidder: {
        email: bid.bidderEmail
      },
      amountCents: bid.amountCents,
      placedAtUtc: bid.placedAtUtc,
      status: bid.status
    }))
  };
}

function createTransactionClient(state: FakeState) {
  return {
    auction: {
      findUnique: vi.fn(async () => ({
        id: state.auction.id,
        listingId: state.auction.listingId,
        status: state.auction.status,
        endAtUtc: state.auction.endAtUtc,
        listing: {
          id: state.listing.id,
          title: state.listing.title,
          status: state.listing.status,
          shippingFeeCents: state.listing.shippingFeeCents,
          fulfillmentMode: state.listing.fulfillmentMode,
          orders: state.orders
            .filter((order) => order.source === "auction_win")
            .slice(0, 1)
            .map((order) => ({
              id: order.id
            }))
        },
        bids: state.bids.map((bid) => ({
          id: bid.id,
          bidderUserId: bid.bidderUserId,
          bidder: {
            email: bid.bidderEmail
          },
          amountCents: bid.amountCents,
          placedAtUtc: bid.placedAtUtc,
          status: bid.status
        }))
      })),
      update: vi.fn(
        async (args: {
          data: {
            status: string;
            closedAtUtc: Date;
            currentHighestBidCents: number | null;
            currentHighestBidderId: string | null;
          };
        }) => {
          state.auction.status = args.data.status;
          state.auction.closedAtUtc = args.data.closedAtUtc;
          state.auction.currentHighestBidCents = args.data.currentHighestBidCents;
          state.auction.currentHighestBidderId = args.data.currentHighestBidderId;
          return state.auction;
        }
      )
    },
    bid: {
      updateMany: vi.fn(async () => {
        for (const bid of state.bids) {
          if (bid.status === "winning") {
            bid.status = "outbid";
            bid.isWinning = false;
          }
        }

        return {
          count: 1
        };
      }),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: {
            status: string;
            isWinning: boolean;
          };
        }) => {
          const bid = state.bids.find((candidate) => candidate.id === args.where.id);

          if (!bid) {
            throw new Error(`Missing bid ${args.where.id}`);
          }

          bid.status = args.data.status;
          bid.isWinning = args.data.isWinning;

          return bid;
        }
      )
    },
    order: {
      create: vi.fn(
        async (args: {
          data: {
            listingId: string;
            buyerUserId: string;
            winningBidId: string;
            source: string;
            status: string;
            paymentDeadlineAtUtc: Date;
          };
          select: {
            id: boolean;
            paymentDeadlineAtUtc: boolean;
          };
        }) => {
          const createdOrder = {
            id: `order_${state.orders.length + 1}`,
            listingId: args.data.listingId,
            buyerUserId: args.data.buyerUserId,
            source: args.data.source,
            status: args.data.status,
            winningBidId: args.data.winningBidId,
            paymentDeadlineAtUtc: args.data.paymentDeadlineAtUtc
          };

          state.orders.push(createdOrder);

          return {
            id: createdOrder.id,
            paymentDeadlineAtUtc: createdOrder.paymentDeadlineAtUtc
          };
        }
      )
    },
    listing: {
      update: vi.fn(async (args: { data: { status: string } }) => {
        state.listing.status = args.data.status;
        return state.listing;
      })
    }
  };
}

describe("auction close job", () => {
  let state: FakeState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = buildState();

    prismaMock.prisma.auction.findMany.mockImplementation(
      async (args?: FindExpiredAuctionCandidatesArgs) => {
        if (state.auction.status !== "live" || state.listing.status !== "published") {
          return [];
        }

        const lt = args?.where?.endAtUtc?.lt;
        const lte = args?.where?.endAtUtc?.lte;

        if (lt && state.auction.endAtUtc.getTime() >= lt.getTime()) {
          return [];
        }

        if (lte && state.auction.endAtUtc.getTime() > lte.getTime()) {
          return [];
        }

        return [buildCandidate(state)];
      }
    );

    prismaMock.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const transactionState = structuredClone(state) as FakeState;
      const result = await callback(createTransactionClient(transactionState));
      state = transactionState;
      return result;
    });
  });

  it("finalizes an expired auction and sends payment instructions to the winner once", async () => {
    const firstRun = await closeExpiredAuctions({
      now: new Date("2026-04-24T12:00:00.000Z"),
      paymentWindowHours: 48
    });
    const secondRun = await closeExpiredAuctions({
      now: new Date("2026-04-24T12:05:00.000Z"),
      paymentWindowHours: 48
    });

    expect(firstRun.processedCount).toBe(1);
    expect(firstRun.errorCount).toBe(0);
    expect(firstRun.metrics).toEqual({
      finalizedWithWinnerCount: 1,
      endedNoBidsCount: 0
    });
    expect(state.orders).toHaveLength(1);
    expect(state.listing.status).toBe("sold_pending_payment");
    expect(state.auction.status).toBe("awaiting_payment");
    expect(notificationMocks.sendAuctionWonPaymentInstructionsNotification).toHaveBeenCalledWith({
      orderId: "order_1",
      buyerEmail: "winner@example.com",
      listingTitle: "Rare arcade flyer set",
      paymentDeadlineAtUtc: new Date("2026-04-26T12:00:00.000Z")
    });
    expect(secondRun.processedCount).toBe(0);
    expect(secondRun.errorCount).toBe(0);
    expect(notificationMocks.sendAuctionWonPaymentInstructionsNotification).toHaveBeenCalledTimes(1);
  });

  it("includes auctions ending at the close instant so admin-forced close creates an auction-win order", async () => {
    state.bids.push({
      id: "bid_2",
      bidderUserId: "buyer_2",
      bidderEmail: "higher-bidder@example.com",
      amountCents: 9_000,
      placedAtUtc: new Date("2026-04-24T10:45:00.000Z"),
      status: "active",
      isWinning: false
    });

    const closeInstant = new Date("2026-04-24T11:00:00.000Z");
    const result = await closeExpiredAuctions({
      now: closeInstant,
      paymentWindowHours: 48
    });

    expect(prismaMock.prisma.auction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endAtUtc: {
            lte: closeInstant
          }
        })
      })
    );
    expect(result.processedCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.metrics).toEqual({
      finalizedWithWinnerCount: 1,
      endedNoBidsCount: 0
    });
    expect(state.auction.status).toBe("awaiting_payment");
    expect(state.auction.currentHighestBidCents).toBe(9_000);
    expect(state.auction.currentHighestBidderId).toBe("buyer_2");
    expect(state.listing.status).toBe("sold_pending_payment");
    expect(state.orders).toEqual([
      expect.objectContaining({
        buyerUserId: "buyer_2",
        source: "auction_win",
        status: "awaiting_payment",
        winningBidId: "bid_2"
      })
    ]);
  });

  it("closes an expired auction with no bids without creating an order", async () => {
    state.bids = [];

    const result = await closeExpiredAuctions({
      now: new Date("2026-04-24T12:00:00.000Z"),
      paymentWindowHours: 48
    });

    expect(result.processedCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.metrics).toEqual({
      finalizedWithWinnerCount: 0,
      endedNoBidsCount: 1
    });
    expect(state.auction.status).toBe("ended_no_bids");
    expect(state.auction.currentHighestBidCents).toBeNull();
    expect(state.auction.currentHighestBidderId).toBeNull();
    expect(state.listing.status).toBe("unsold");
    expect(state.orders).toHaveLength(0);
    expect(notificationMocks.sendAuctionWonPaymentInstructionsNotification).not.toHaveBeenCalled();
  });
});
