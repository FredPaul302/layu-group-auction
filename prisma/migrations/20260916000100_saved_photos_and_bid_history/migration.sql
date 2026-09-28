CREATE TABLE "saved_photos" (
  "id" TEXT NOT NULL,
  "seller_user_id" TEXT NOT NULL,
  "storage_key" VARCHAR(255) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_photos_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "saved_photos_storage_key_key" ON "saved_photos"("storage_key");
CREATE INDEX "saved_photos_seller_created_idx" ON "saved_photos"("seller_user_id", "created_at_utc");

-- A listing deletion must never cascade into bid history, even during a race.
ALTER TABLE "bids" DROP CONSTRAINT "bids_auction_id_fkey";
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
