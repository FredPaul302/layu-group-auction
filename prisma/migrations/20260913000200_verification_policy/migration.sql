ALTER TABLE "site_settings"
  ADD COLUMN "verification_level" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "email_only_limit_cents" INTEGER NOT NULL DEFAULT 10000,
  ADD CONSTRAINT "site_settings_verification_level_check" CHECK ("verification_level" BETWEEN 1 AND 3),
  ADD CONSTRAINT "site_settings_email_only_limit_check" CHECK ("email_only_limit_cents" BETWEEN 100 AND 100000000);
