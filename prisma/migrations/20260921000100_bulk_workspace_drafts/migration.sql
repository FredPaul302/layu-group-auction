CREATE TABLE "bulk_workspaces" (
  "id" TEXT PRIMARY KEY,
  "seller_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "listing_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at_utc" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "bulk_workspaces_seller_user_id_updated_at_utc_idx" ON "bulk_workspaces"("seller_user_id", "updated_at_utc");
CREATE TABLE "bulk_workspace_photos" (
  "workspace_id" TEXT NOT NULL REFERENCES "bulk_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "photo_id" TEXT NOT NULL REFERENCES "saved_photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("workspace_id", "photo_id")
);
CREATE TABLE "bulk_workspace_assets" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL REFERENCES "bulk_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "client_id" TEXT NOT NULL,
  "storage_key" VARCHAR(255) NOT NULL UNIQUE,
  "file_name" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  UNIQUE ("workspace_id", "client_id")
);
