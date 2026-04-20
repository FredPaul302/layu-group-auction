ALTER TABLE "categories"
ADD COLUMN "description" TEXT,
RENAME COLUMN "minimum_starting_bid_cents" TO "minimum_start_bid_cents";

ALTER TABLE "pickup_events"
ADD COLUMN "address" TEXT;

ALTER TABLE "listings"
ADD COLUMN "pickup_event_id" TEXT,
ADD COLUMN "condition_note" TEXT,
ADD COLUMN "shipping_notes" TEXT;

ALTER TABLE "listings"
ADD CONSTRAINT "listings_pickup_event_id_fkey"
FOREIGN KEY ("pickup_event_id") REFERENCES "pickup_events"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "listings_pickup_event_status_idx" ON "listings"("pickup_event_id", "status");
