ALTER TABLE "site_settings"
  ADD COLUMN "deposit_tier_1_cents" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "deposit_tier_2_cents" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN "launch_auction_limit_cents" INTEGER NOT NULL DEFAULT 4000;

ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_deposit_tiers_check"
  CHECK ("deposit_tier_1_cents" >= 1
    AND "deposit_tier_2_cents" > "deposit_tier_1_cents"
    AND "deposit_tier_2_cents" <= 100000000
    AND "launch_auction_limit_cents" >= 0
    AND "launch_auction_limit_cents" <= 100000000);
