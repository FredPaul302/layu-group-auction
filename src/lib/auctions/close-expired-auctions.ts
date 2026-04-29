import { Prisma } from "@prisma/client";

import { sendAuctionWonPaymentInstructionsNotification } from "@/lib/notifications/workflow-events";
import { logStructuredEvent, serializeError } from "@/lib/ops/structured-logging";
import { prisma } from "@/lib/prisma";

import type { DomainJobInput, DomainJobResult } from "../jobs/types";
import {
  resolveExpiredAuction,
  type CloseAuctionBidRecord
} from "./rules";

export type CloseExpiredAuctionJobCandidate = {
  auctionId: string;
  listingId: string;
  listingTitle: string;
  auctionStatus: "live" | "ended" | "awaiting_payment" | "ended_no_bids" | "archived";
  listingStatus:
    | "draft"
    | "published"
    | "ended"
    | "sold_pending_payment"
    | "paid"
    | "ready_for_fulfillment"
    | "fulfilled"
    | "unsold"
    | "archived";
  endAtUtc: Date;
  listingShippingFeeCents: number;
  fulfillmentMode: "pickup_only" | "shipping_only" | "pickup_or_shipping";
  bids: CloseAuctionBidRecord[];
  existingAuctionWinOrderId?: string | null;
};

export type CloseExpiredAuctionsInput = DomainJobInput & {
  now?: Date;
  paymentWindowHours?: number;
  candidates?: CloseExpiredAuctionJobCandidate[];
};

async function getWinnerPaymentWindowHours() {
  const siteSetting = await prisma.siteSetting.findUnique({
    where: {
      id: 1
    },
    select: {
      defaultWinnerPaymentWindowHours: true
    }
  });

  return siteSetting?.defaultWinnerPaymentWindowHours ?? 48;
}

async function listExpiredLiveAuctionCandidates(
  now: Date
): Promise<CloseExpiredAuctionJobCandidate[]> {
  const auctions = await prisma.auction.findMany({
    where: {
      status: "live",
      endAtUtc: {
        lte: now
      },
      listing: {
        status: "published",
        listingType: "auction"
      }
    },
    select: {
      id: true,
      status: true,
      endAtUtc: true,
      listingId: true,
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          shippingFeeCents: true,
          fulfillmentMode: true,
          orders: {
            where: {
              source: "auction_win"
            },
            take: 1,
            select: {
              id: true
            }
          }
        }
      },
      bids: {
        select: {
          id: true,
          bidderUserId: true,
          bidder: {
            select: {
              email: true
            }
          },
          amountCents: true,
          placedAtUtc: true,
          status: true
        },
        orderBy: [{ amountCents: "desc" }, { placedAtUtc: "asc" }]
      }
    }
  });

  return auctions.map((auction) => ({
    auctionId: auction.id,
    listingId: auction.listingId,
    listingTitle: auction.listing.title,
    auctionStatus: auction.status,
    listingStatus: auction.listing.status,
    endAtUtc: auction.endAtUtc,
    listingShippingFeeCents: auction.listing.shippingFeeCents,
    fulfillmentMode: auction.listing.fulfillmentMode,
    bids: auction.bids.map((bid) => ({
      id: bid.id,
      bidderUserId: bid.bidderUserId,
      bidderEmail: bid.bidder.email,
      amountCents: bid.amountCents,
      placedAtUtc: bid.placedAtUtc,
      status: bid.status
    })),
    existingAuctionWinOrderId: auction.listing.orders[0]?.id ?? null
  }));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown job error.";
}

async function applyResolvedExpiredAuction(input: {
  candidate: CloseExpiredAuctionJobCandidate;
  now: Date;
  paymentWindowHours: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const freshAuction = await transaction.auction.findUnique({
      where: {
        id: input.candidate.auctionId
      },
      select: {
        id: true,
        listingId: true,
        status: true,
        endAtUtc: true,
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            shippingFeeCents: true,
            fulfillmentMode: true,
            orders: {
              where: {
                source: "auction_win"
              },
              take: 1,
              select: {
                id: true
              }
            }
          }
        },
        bids: {
          select: {
            id: true,
            bidderUserId: true,
            bidder: {
              select: {
                email: true
              }
            },
            amountCents: true,
            placedAtUtc: true,
            status: true
          },
          orderBy: [{ amountCents: "desc" }, { placedAtUtc: "asc" }]
        }
      }
    });

    if (!freshAuction || freshAuction.listing.status !== "published") {
      return {
        processed: false as const
      };
    }

    const resolution = resolveExpiredAuction({
      auctionStatus: freshAuction.status,
      endAtUtc: freshAuction.endAtUtc,
      listingShippingFeeCents: freshAuction.listing.shippingFeeCents,
      fulfillmentMode: freshAuction.listing.fulfillmentMode,
      bids: freshAuction.bids,
      paymentWindowHours: input.paymentWindowHours,
      now: input.now,
      existingAuctionWinOrderId: freshAuction.listing.orders[0]?.id ?? null
    });

    if (!resolution.shouldClose) {
      return {
        processed: false as const
      };
    }

    if (resolution.outcome === "ended_no_bids") {
      await transaction.auction.update({
        where: {
          id: freshAuction.id
        },
        data: {
          status: resolution.auctionStatus,
          closedAtUtc: resolution.closedAtUtc,
          currentHighestBidCents: null,
          currentHighestBidderId: null
        }
      });

      await transaction.listing.update({
        where: {
          id: freshAuction.listing.id
        },
        data: {
          status: resolution.listingStatus
        }
      });

      return {
        processed: true as const,
        outcome: "ended_no_bids" as const,
        winningOrderNotification: null
      };
    }

    await transaction.bid.updateMany({
      where: {
        auctionId: freshAuction.id,
        status: "winning"
      },
      data: {
        status: "outbid",
        isWinning: false
      }
    });

    await transaction.bid.update({
      where: {
        id: resolution.winningBid.id
      },
      data: {
        status: "winning",
        isWinning: true
      }
    });

    let winningOrderNotification:
      | {
          orderId: string;
          buyerEmail: string;
          listingTitle: string;
          paymentDeadlineAtUtc: Date;
        }
      | null = null;

    if (resolution.orderDraft) {
      try {
        const createdOrder = await transaction.order.create({
          data: {
            listingId: freshAuction.listing.id,
            buyerUserId: resolution.orderDraft.buyerUserId,
            winningBidId: resolution.winningBid.id,
            source: "auction_win",
            status: "awaiting_payment",
            subtotalCents: resolution.orderDraft.subtotalCents,
            shippingFeeCents: resolution.orderDraft.shippingFeeCents,
            totalCents: resolution.orderDraft.totalCents,
            selectedFulfillmentMode: resolution.orderDraft.selectedFulfillmentMode,
            paymentDeadlineAtUtc: resolution.orderDraft.paymentDeadlineAtUtc
          },
          select: {
            id: true,
            paymentDeadlineAtUtc: true
          }
        });

        const winningBidEmail =
          freshAuction.bids.find((bid) => bid.id === resolution.winningBid.id)?.bidder.email ??
          null;

        if (winningBidEmail) {
          winningOrderNotification = {
            orderId: createdOrder.id,
            buyerEmail: winningBidEmail,
            listingTitle: freshAuction.listing.title,
            paymentDeadlineAtUtc: createdOrder.paymentDeadlineAtUtc
          };
        }
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
      }
    }

    await transaction.auction.update({
      where: {
        id: freshAuction.id
      },
      data: {
        status: resolution.auctionStatus,
        closedAtUtc: resolution.closedAtUtc,
        currentHighestBidCents: resolution.winningBid.amountCents,
        currentHighestBidderId: resolution.winningBid.bidderUserId
      }
    });

    await transaction.listing.update({
      where: {
        id: freshAuction.listing.id
      },
      data: {
        status: resolution.listingStatus
      }
    });

    return {
      processed: true as const,
      outcome: "awaiting_payment" as const,
      winningOrderNotification
    };
  });
}

export async function closeExpiredAuctions(
  input: CloseExpiredAuctionsInput = {}
): Promise<DomainJobResult> {
  const now = input.now ?? new Date();
  const startedAtUtc = new Date().toISOString();
  const paymentWindowHours =
    input.paymentWindowHours ??
    (input.candidates ? 48 : await getWinnerPaymentWindowHours());
  const candidates = input.candidates ?? (await listExpiredLiveAuctionCandidates(now));
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let finalizedWithWinnerCount = 0;
  let endedNoBidsCount = 0;
  const notes: string[] = [];

  for (const candidate of candidates) {
    try {
      const resolution = resolveExpiredAuction({
        auctionStatus: candidate.auctionStatus,
        endAtUtc: candidate.endAtUtc,
        listingShippingFeeCents: candidate.listingShippingFeeCents,
        fulfillmentMode: candidate.fulfillmentMode,
        bids: candidate.bids,
        paymentWindowHours,
        now,
        existingAuctionWinOrderId: candidate.existingAuctionWinOrderId ?? null
      });

      if (!resolution.shouldClose) {
        skippedCount += 1;
        continue;
      }

      if (input.dryRun || input.candidates) {
        processedCount += 1;

        if (resolution.outcome === "ended_no_bids") {
          endedNoBidsCount += 1;
        } else {
          finalizedWithWinnerCount += 1;
        }

        continue;
      }

      const persisted = await applyResolvedExpiredAuction({
        candidate,
        now,
        paymentWindowHours
      });

      if (!persisted.processed) {
        skippedCount += 1;
        continue;
      }

      processedCount += 1;

      if (persisted.outcome === "ended_no_bids") {
        endedNoBidsCount += 1;
        logStructuredEvent("info", "auction_closed_no_bids", {
          auctionId: candidate.auctionId,
          listingId: candidate.listingId,
          listingTitle: candidate.listingTitle
        });
      } else {
        finalizedWithWinnerCount += 1;
        logStructuredEvent("info", "auction_closed_with_winner", {
          auctionId: candidate.auctionId,
          listingId: candidate.listingId,
          listingTitle: candidate.listingTitle,
          winningOrderId: persisted.winningOrderNotification?.orderId ?? null
        });
      }

      if (persisted.winningOrderNotification) {
        await sendAuctionWonPaymentInstructionsNotification(persisted.winningOrderNotification);
      }
    } catch (error) {
      errorCount += 1;

      const errorMessage = getErrorMessage(error);

      notes.push(`Auction ${candidate.auctionId} failed close processing: ${errorMessage}`);
      logStructuredEvent("error", "auction_close_failed", {
        auctionId: candidate.auctionId,
        error: serializeError(error)
      });
    }
  }

  const completedAtUtc = new Date().toISOString();

  return {
    jobName: "auctions.closeExpired",
    status: "completed",
    dryRun: input.dryRun ?? false,
    processedCount,
    skippedCount,
    errorCount,
    startedAtUtc,
    completedAtUtc,
    timestampUtc: completedAtUtc,
    metrics: {
      finalizedWithWinnerCount,
      endedNoBidsCount
    },
    notes: [
      `Resolved ${processedCount} expired live auction(s).`,
      `Finalized ${finalizedWithWinnerCount} auction(s) with a winner.`,
      `Closed ${endedNoBidsCount} auction(s) with no bids.`,
      `Skipped ${skippedCount} auction(s) that no longer required closing.`,
      `Encountered ${errorCount} error(s).`,
      ...notes
    ]
  };
}
