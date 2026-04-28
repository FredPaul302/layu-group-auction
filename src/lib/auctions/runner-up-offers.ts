import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendRunnerUpOfferSentNotification } from "@/lib/notifications/workflow-events";

import { canParticipateInCommerce, hasVerifiedEmail } from "@/lib/permissions";
import { hasTierAccess } from "@/lib/verification";

import { getOrderFinancials, OrderActionError } from "../orders/rules";

import {
  resolveRunnerUpOfferExpiry,
  resolveRunnerUpOfferResponse,
  selectRunnerUpBid
} from "./rules";

const maxSerializableRetries = 3;

function isRunnerUpOfferRetryError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

async function getRunnerUpOfferWindowHours() {
  const siteSetting = await prisma.siteSetting.findUnique({
    where: {
      id: 1
    },
    select: {
      defaultRunnerUpOfferWindowHours: true
    }
  });

  return siteSetting?.defaultRunnerUpOfferWindowHours ?? 48;
}

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

function buildRunnerUpOfferWindow(now: Date, offerWindowHours: number) {
  return new Date(now.getTime() + offerWindowHours * 60 * 60 * 1000);
}

export async function createRunnerUpOfferFromOrder(input: {
  listingId: string;
  orderId: string;
  offeredByUserId: string;
  notes?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const offerWindowHours = await getRunnerUpOfferWindowHours();

  for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
    try {
      const createdOffer = await prisma.$transaction(
        async (transaction) => {
          const order = await transaction.order.findFirst({
            where: {
              id: input.orderId,
              listingId: input.listingId
            },
            include: {
              winningBid: true,
              listing: {
                include: {
                  auction: {
                    include: {
                      bids: {
                        orderBy: [{ amountCents: "desc" }, { placedAtUtc: "asc" }],
                        select: {
                          id: true,
                          bidderUserId: true,
                          amountCents: true,
                          placedAtUtc: true,
                          status: true,
                          runnerUpOffer: {
                            select: {
                              id: true
                            }
                          }
                        }
                      },
                      runnerUpOffers: {
                        select: {
                          id: true,
                          status: true
                        }
                      }
                    }
                  }
                }
              }
            }
          });

          if (!order?.listing.auction || order.source !== "auction_win") {
            throw new OrderActionError(
              "order_status_invalid",
              409,
              "Runner-up offers are only available for auction-win orders."
            );
          }

          if (order.status !== "payment_overdue" && order.status !== "cancelled") {
            throw new OrderActionError(
              "order_status_invalid",
              409,
              "Runner-up offers can only be created after an unpaid order is overdue or cancelled."
            );
          }

          if (
            order.listing.auction.runnerUpOffers.some(
              (offer) => offer.status === "pending" || offer.status === "accepted"
            )
          ) {
            throw new OrderActionError(
              "order_status_invalid",
              409,
              "This auction already has an active runner-up offer."
            );
          }

          const runnerUpBid = selectRunnerUpBid({
            bids: order.listing.auction.bids.map((bid) => ({
              ...bid,
              existingRunnerUpOfferId: bid.runnerUpOffer?.id ?? null
            })),
            winningBidId: order.winningBidId,
            winningBidderUserId: order.buyerUserId
          });

          if (!runnerUpBid) {
            throw new OrderActionError(
              "order_status_invalid",
              409,
              "No eligible runner-up bidder was available for this auction."
            );
          }

          return transaction.runnerUpOffer.create({
            data: {
              auctionId: order.listing.auction.id,
              bidId: runnerUpBid.id,
              offeredToUserId: runnerUpBid.bidderUserId,
              offeredByUserId: input.offeredByUserId,
              status: "pending",
              offeredAtUtc: now,
              expiresAtUtc: buildRunnerUpOfferWindow(now, offerWindowHours),
              notes: input.notes?.trim() || null
            },
            include: {
              bid: true,
              offeredToUser: {
                select: {
                  id: true,
                  email: true,
                  displayName: true
                }
              },
              auction: {
                include: {
                  listing: {
                    select: {
                      id: true,
                      title: true
                    }
                  }
                }
              }
            }
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );

      await sendRunnerUpOfferSentNotification({
        listingTitle: createdOffer.auction.listing.title,
        offeredToEmail: createdOffer.offeredToUser.email,
        expiresAtUtc: createdOffer.expiresAtUtc
      });

      return createdOffer;
    } catch (error) {
      if (isRunnerUpOfferRetryError(error) && attempt < maxSerializableRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Runner-up offer could not be created.");
}

export async function respondToRunnerUpOffer(input: {
  offerId: string;
  userId: string;
  decision: "accept" | "decline";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const paymentWindowHours = await getWinnerPaymentWindowHours();

  for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const offer = await transaction.runnerUpOffer.findFirst({
            where: {
              id: input.offerId,
              offeredToUserId: input.userId
            },
            include: {
              order: true,
              bid: true,
              offeredToUser: {
                select: {
                  id: true,
                  role: true,
                  emailVerifiedAtUtc: true,
                  bidderProfile: {
                    select: {
                      isBlocked: true,
                      maxBidTier: true,
                      nonPaymentStrikeCount: true
                    }
                  }
                }
              },
              auction: {
                include: {
                  listing: {
                    select: {
                      id: true,
                      title: true,
                      status: true,
                      fulfillmentMode: true,
                      shippingFeeCents: true,
                      pickupEventId: true,
                      category: {
                        select: {
                          requiredBidTier: true
                        }
                      }
                    }
                  }
                }
              }
            }
          });

          if (!offer) {
            throw new OrderActionError("order_not_found", 404, "Runner-up offer could not be found.");
          }

          const response = resolveRunnerUpOfferResponse({
            decision: input.decision,
            status: offer.status,
            expiresAtUtc: offer.expiresAtUtc,
            now,
            hasExistingOrder: Boolean(offer.order)
          });

          if (response.outcome === "expired") {
            await transaction.runnerUpOffer.updateMany({
              where: {
                id: offer.id,
                status: "pending"
              },
              data: {
                status: response.nextStatus,
                respondedAtUtc: now
              }
            });

            throw new OrderActionError(
              "order_status_invalid",
              409,
              "This runner-up offer has already expired."
            );
          }

          if (response.outcome === "already_accepted") {
            return {
              ...offer,
              order: offer.order
            };
          }

          if (response.outcome === "already_declined") {
            return offer;
          }

          if (response.outcome === "decline") {
            await transaction.runnerUpOffer.updateMany({
              where: {
                id: offer.id,
                status: "pending"
              },
              data: {
                status: response.nextStatus,
                respondedAtUtc: now
              }
            });

            return transaction.runnerUpOffer.findUniqueOrThrow({
              where: {
                id: offer.id
              },
              include: {
                order: true,
                bid: true,
                auction: {
                  include: {
                    listing: true
                  }
                }
              }
            });
          }

          if (
            !hasVerifiedEmail(offer.offeredToUser) ||
            !canParticipateInCommerce(offer.offeredToUser)
          ) {
            throw new OrderActionError(
              "secondary_verification_required",
              403,
              "Current verification is required before accepting a runner-up offer."
            );
          }

          if (
            !hasTierAccess(
              offer.offeredToUser.bidderProfile?.maxBidTier ?? "tier_0",
              offer.auction.listing.category.requiredBidTier
            )
          ) {
            throw new OrderActionError(
              "tier_access_required",
              403,
              "Your current approved tier does not allow this runner-up offer."
            );
          }

          if (offer.order) {
            return {
              ...offer,
              order: offer.order
            };
          }

          const financials = getOrderFinancials({
            subtotalCents: offer.bid.amountCents,
            fulfillmentMode: offer.auction.listing.fulfillmentMode,
            shippingFeeCents: offer.auction.listing.shippingFeeCents
          });
          const paymentDeadlineAtUtc = new Date(
            now.getTime() + paymentWindowHours * 60 * 60 * 1000
          );

          const order = await transaction.order.create({
            data: {
              listingId: offer.auction.listing.id,
              buyerUserId: input.userId,
              runnerUpOfferId: offer.id,
              source: "runner_up_offer",
              status: "awaiting_payment",
              subtotalCents: financials.subtotalCents,
              shippingFeeCents: financials.shippingFeeCents,
              totalCents: financials.totalCents,
              selectedFulfillmentMode: financials.selectedFulfillmentMode,
              pickupEventId:
                offer.auction.listing.fulfillmentMode === "pickup_only"
                  ? offer.auction.listing.pickupEventId
                  : null,
              paymentDeadlineAtUtc
            }
          });

          await transaction.runnerUpOffer.updateMany({
            where: {
              id: offer.id,
              status: "pending"
            },
            data: {
              status: response.nextStatus,
              respondedAtUtc: now
            }
          });

          const updatedOffer = await transaction.runnerUpOffer.findUniqueOrThrow({
            where: {
              id: offer.id
            },
            include: {
              bid: true,
              auction: {
                include: {
                  listing: true
                }
              },
              order: true
            }
          });

          return {
            ...updatedOffer,
            order
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (isRunnerUpOfferRetryError(error) && attempt < maxSerializableRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Runner-up offer response could not be completed.");
}

export async function listRunnerUpOffersForUser(userId: string) {
  return prisma.runnerUpOffer.findMany({
    where: {
      offeredToUserId: userId
    },
    include: {
      bid: true,
      order: true,
      auction: {
        include: {
          listing: {
            include: {
              images: {
                orderBy: {
                  sortOrder: "asc"
                },
                take: 1
              }
            }
          }
        }
      }
    },
    orderBy: [{ createdAtUtc: "desc" }]
  });
}

export async function listAdminRunnerUpOffers() {
  return prisma.runnerUpOffer.findMany({
    include: {
      bid: true,
      order: true,
      offeredToUser: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      },
      offeredByUser: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      },
      auction: {
        include: {
          listing: {
            select: {
              id: true,
              title: true
            }
          }
        }
      }
    },
    orderBy: [{ updatedAtUtc: "desc" }]
  });
}

export type ExpireRunnerUpOfferCandidate = {
  offerId: string;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  expiresAtUtc: Date;
};

export async function expireRunnerUpOffers(input: {
  dryRun?: boolean;
  now?: Date;
  candidates?: ExpireRunnerUpOfferCandidate[];
} = {}) {
  const now = input.now ?? new Date();
  const startedAtUtc = new Date().toISOString();
  const candidates =
    input.candidates ??
    (await prisma.runnerUpOffer.findMany({
      where: {
        status: "pending",
        expiresAtUtc: {
          lt: now
        }
      },
      select: {
        id: true,
        status: true,
        expiresAtUtc: true
      }
    })).map((offer) => ({
      offerId: offer.id,
      status: offer.status,
      expiresAtUtc: offer.expiresAtUtc
    }));

  let processedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
    const resolution = resolveRunnerUpOfferExpiry({
      status: candidate.status,
      expiresAtUtc: candidate.expiresAtUtc,
      now
    });

    if (!resolution.shouldExpire) {
      skippedCount += 1;
      continue;
    }

    if (input.dryRun || input.candidates) {
      processedCount += 1;
      continue;
    }

    const updatedOffer = await prisma.runnerUpOffer.updateMany({
      where: {
        id: candidate.offerId,
        status: "pending"
      },
      data: {
        status: resolution.nextStatus,
        respondedAtUtc: now
      }
    });

    if (updatedOffer.count === 1) {
      processedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  const completedAtUtc = new Date().toISOString();

  return {
    jobName: "offers.expireRunnerUp",
    status: "completed" as const,
    dryRun: input.dryRun ?? false,
    processedCount,
    skippedCount,
    errorCount: 0,
    startedAtUtc,
    completedAtUtc,
    timestampUtc: completedAtUtc,
    metrics: {
      expiredOfferCount: processedCount
    },
    notes: [
      `Expired ${processedCount} pending runner-up offer(s).`,
      `Skipped ${skippedCount} offer(s) that no longer required expiry.`
    ]
  };
}
