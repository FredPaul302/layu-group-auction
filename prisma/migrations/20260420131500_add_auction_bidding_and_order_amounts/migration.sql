ALTER TYPE "AuctionStatus" RENAME VALUE 'active' TO 'live';
ALTER TYPE "AuctionStatus" RENAME VALUE 'awarded' TO 'awaiting_payment';
ALTER TYPE "AuctionStatus" RENAME VALUE 'closed_unsold' TO 'ended_no_bids';

ALTER TABLE "auctions"
ADD COLUMN "current_highest_bid_cents" INTEGER,
ADD COLUMN "current_highest_bidder_id" TEXT;

ALTER TABLE "auctions"
ADD CONSTRAINT "auctions_current_highest_bidder_id_fkey"
FOREIGN KEY ("current_highest_bidder_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "auctions_current_highest_bidder_idx" ON "auctions"("current_highest_bidder_id");

ALTER TABLE "orders"
ADD COLUMN "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shipping_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "total_cents" INTEGER NOT NULL DEFAULT 0;
