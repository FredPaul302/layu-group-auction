-- CreateTable
CREATE TABLE "listing_videos" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "public_url" VARCHAR(500),
    "content_type" VARCHAR(120) NOT NULL,
    "file_name" VARCHAR(255),
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_videos_storage_key_key" ON "listing_videos"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "listing_videos_listing_sort_order_key" ON "listing_videos"("listing_id", "sort_order");

-- AddForeignKey
ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
