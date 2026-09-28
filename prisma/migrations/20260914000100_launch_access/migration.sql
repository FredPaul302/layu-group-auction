ALTER TABLE "site_settings"
  ADD COLUMN "launch_access_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "homepage_video_url" VARCHAR(1000);

-- Historical payment amounts stay intact. Legacy $10 access joins the $1 tier.
UPDATE "categories" SET "required_bid_tier" = 'tier_5' WHERE "required_bid_tier" = 'tier_10';
UPDATE "bidder_profiles" SET "max_bid_tier" = 'tier_5' WHERE "max_bid_tier" = 'tier_10';
