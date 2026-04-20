import type { AuctionStatus, BidTier, ListingStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  assertAuctionBidGate,
  assertBidAmountCents,
  type AuctionBidSnapshot,
  AuctionActionError,
  getAuctionBidGate
} from "./rules";

const maxSerializableRetries = 3;

function isSerializableRetryError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function buildAuctionBidSnapshot(input: {
  listingType: "auction" | "fixed_price";
  listingStatus: ListingStatus;
  requiredBidTier: BidTier;
  auction: {
    status: AuctionStatus;
    endAtUtc: Date;
    startingBidCents: number;
    currentHighestBidCents: number | null;
    minimumIncrementCents: number;
  } | null;
}): AuctionBidSnapshot {
  if (!input.auction) {
    throw new AuctionActionError(
      "auction_listing_required",
      404,
      "Auction listing could not be found."
    );
  }

  return {
    listingType: input.listingType,
    listingStatus: input.listingStatus,
    auctionStatus: input.auction.status,
    endAtUtc: input.auction.endAtUtc,
    startingBidCents: input.auction.startingBidCents,
    currentHighestBidCents: input.auction.currentHighestBidCents,
    minimumIncrementCents: input.auction.minimumIncrementCents,
    requiredBidTier: input.requiredBidTier
  };
}

export async function placeBidOnListing(input: {
  listingId: string;
  bidderUserId: string;
  amountCents: number;
  now?: Date;
}) {
  const placedAtUtc = input.now ?? new Date();

  for (let attempt = 0; attempt < maxSerializableRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const [listing, bidder] = await Promise.all([
            transaction.listing.findFirst({
              where: {
                id: input.listingId,
                listingType: "auction"
              },
              select: {
                id: true,
                title: true,
                listingType: true,
                status: true,
                category: {
                  select: {
                    name: true,
                    requiredBidTier: true
                  }
                },
                auction: {
                  select: {
                    id: true,
                    status: true,
                    endAtUtc: true,
                    startingBidCents: true,
                    currentHighestBidCents: true,
                    currentHighestBidderId: true,
                    minimumIncrementCents: true
                  }
                }
              }
            }),
            transaction.user.findUnique({
              where: {
                id: input.bidderUserId
              },
              select: {
                id: true,
                role: true,
                emailVerifiedAtUtc: true,
                bidderProfile: {
                  select: {
                    isBlocked: true,
                    maxBidTier: true
                  }
                }
              }
            })
          ]);

          if (!listing || !listing.auction) {
            throw new AuctionActionError(
              "auction_listing_required",
              404,
              "Auction listing could not be found."
            );
          }

          const gate = getAuctionBidGate({
            subject: bidder,
            snapshot: buildAuctionBidSnapshot({
              listingType: listing.listingType,
              listingStatus: listing.status,
              requiredBidTier: listing.category.requiredBidTier,
              auction: listing.auction
            }),
            now: placedAtUtc
          });

          assertAuctionBidGate(gate);
          assertBidAmountCents(input.amountCents, gate.nextMinimumBidCents);

          await transaction.bid.updateMany({
            where: {
              auctionId: listing.auction.id,
              status: "winning"
            },
            data: {
              status: "outbid",
              isWinning: false
            }
          });

          const bid = await transaction.bid.create({
            data: {
              auctionId: listing.auction.id,
              bidderUserId: input.bidderUserId,
              amountCents: input.amountCents,
              status: "winning",
              isWinning: true,
              placedAtUtc
            }
          });

          await transaction.auction.update({
            where: {
              id: listing.auction.id
            },
            data: {
              currentHighestBidCents: bid.amountCents,
              currentHighestBidderId: input.bidderUserId
            }
          });

          return {
            bid,
            listingId: listing.id,
            listingTitle: listing.title,
            currentPriceCents: bid.amountCents,
            nextMinimumBidCents: bid.amountCents + listing.auction.minimumIncrementCents
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (isSerializableRetryError(error) && attempt < maxSerializableRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Bid placement could not be completed.");
}

export async function listBidsForUser(userId: string) {
  return prisma.bid.findMany({
    where: {
      bidderUserId: userId
    },
    orderBy: [{ placedAtUtc: "desc" }],
    select: {
      id: true,
      amountCents: true,
      status: true,
      isWinning: true,
      placedAtUtc: true,
      order: {
        select: {
          id: true,
          status: true,
          paymentDeadlineAtUtc: true
        }
      },
      auction: {
        select: {
          id: true,
          status: true,
          endAtUtc: true,
          currentHighestBidCents: true,
          listing: {
            select: {
              id: true,
              title: true,
              status: true,
              images: {
                orderBy: {
                  sortOrder: "asc"
                },
                take: 1,
                select: {
                  publicUrl: true,
                  altText: true
                }
              }
            }
          }
        }
      }
    }
  });
}
