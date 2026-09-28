CREATE TABLE "social_accounts" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "provider" VARCHAR(20) NOT NULL,
  "provider_account_id" VARCHAR(255) NOT NULL, "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_accounts_provider_check" CHECK ("provider" IN ('google', 'facebook')),
  CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "social_accounts_provider_provider_account_id_key" ON "social_accounts"("provider", "provider_account_id");
CREATE UNIQUE INDEX "social_accounts_user_id_provider_key" ON "social_accounts"("user_id", "provider");

CREATE TABLE "social_login_attempts" (
  "state_hash" VARCHAR(64) NOT NULL, "browser_token_hash" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(20) NOT NULL, "intent" VARCHAR(20) NOT NULL, "user_id" TEXT,
  "next_path" VARCHAR(500) NOT NULL, "code_verifier" VARCHAR(128) NOT NULL, "nonce" VARCHAR(128) NOT NULL,
  "terms_version" VARCHAR(32), "expires_at_utc" TIMESTAMPTZ(3) NOT NULL,
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_login_attempts_pkey" PRIMARY KEY ("state_hash")
);
CREATE INDEX "social_login_attempts_expires_at_utc_idx" ON "social_login_attempts"("expires_at_utc");

CREATE TABLE "cross_listings" (
  "id" TEXT NOT NULL, "seller_user_id" TEXT NOT NULL, "listing_id" TEXT,
  "channel" VARCHAR(32) NOT NULL, "status" VARCHAR(32) NOT NULL DEFAULT 'ready',
  "version" INTEGER NOT NULL DEFAULT 1, "snapshot" JSONB NOT NULL, "overrides" JSONB NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL, "external_id" VARCHAR(255), "external_url" VARCHAR(1000),
  "last_error" VARCHAR(1000), "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "cross_listings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cross_listings_version_check" CHECK ("version" > 0),
  CONSTRAINT "cross_listings_channel_check" CHECK ("channel" IN ('facebook_marketplace', 'facebook_page', 'facebook_shop', 'ebay', 'craigslist', 'mercari', 'shopify')),
  CONSTRAINT "cross_listings_status_check" CHECK ("status" IN ('ready', 'blocked', 'sending', 'posted', 'external_draft', 'review', 'removed', 'error')),
  CONSTRAINT "cross_listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cross_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cross_listings_listing_id_channel_key" ON "cross_listings"("listing_id", "channel");
CREATE INDEX "cross_listings_seller_user_id_updated_at_utc_idx" ON "cross_listings"("seller_user_id", "updated_at_utc");
