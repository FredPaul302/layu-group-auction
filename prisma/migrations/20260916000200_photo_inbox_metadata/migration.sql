ALTER TABLE "saved_photos"
  ADD COLUMN "content_hash" VARCHAR(64),
  ADD COLUMN "captured_at_utc" TIMESTAMPTZ(3),
  ADD COLUMN "file_modified_at_utc" TIMESTAMPTZ(3),
  ADD COLUMN "photo_date_source" VARCHAR(32),
  ADD COLUMN "metadata_version" INTEGER;

-- Existing duplicate copies remain intact. New writes serialize on each owner's
-- content hash before checking for an existing photo.
CREATE INDEX "saved_photos_seller_hash_idx" ON "saved_photos"("seller_user_id", "content_hash");
