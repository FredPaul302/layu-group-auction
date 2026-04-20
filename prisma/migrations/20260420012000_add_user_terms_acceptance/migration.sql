ALTER TABLE "users"
ADD COLUMN "accepted_terms_version" VARCHAR(32),
ADD COLUMN "accepted_terms_at_utc" TIMESTAMPTZ(3);
