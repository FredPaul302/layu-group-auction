-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'bidder');

-- CreateEnum
CREATE TYPE "BidTier" AS ENUM ('tier_0', 'tier_5', 'tier_10', 'tier_20', 'full');

-- CreateEnum
CREATE TYPE "BidderFlagType" AS ENUM ('blocked', 'non_paying', 'late_payment', 'suspicious', 'admin_note');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('auction', 'fixed_price');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'published', 'ended', 'sold_pending_payment', 'paid', 'ready_for_fulfillment', 'fulfilled', 'unsold', 'archived');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('pickup_only', 'shipping_only', 'pickup_or_shipping');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('active', 'ended', 'awarded', 'closed_unsold', 'archived');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('active', 'outbid', 'winning', 'invalid', 'withdrawn');

-- CreateEnum
CREATE TYPE "PersonaVerificationStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'released', 'refunded');

-- CreateEnum
CREATE TYPE "RunnerUpOfferStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('auction_win', 'fixed_price_claim', 'runner_up_offer');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('awaiting_payment', 'payment_submitted', 'payment_rejected', 'paid', 'payment_overdue', 'ready_for_fulfillment', 'fulfilled', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "PaymentMethodCode" AS ENUM ('paypal', 'venmo', 'cash_app');

-- CreateEnum
CREATE TYPE "PaymentReviewStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'bidder',
    "display_name" VARCHAR(120),
    "email_verified_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidder_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "max_bid_tier" "BidTier" NOT NULL DEFAULT 'tier_0',
    "active_hold_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_at_utc" TIMESTAMPTZ(3),
    "block_reason" TEXT,
    "non_payment_strike_count" INTEGER NOT NULL DEFAULT 0,
    "last_non_payment_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bidder_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidder_flags" (
    "id" TEXT NOT NULL,
    "bidder_profile_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "flag_type" "BidderFlagType" NOT NULL,
    "reason" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at_utc" TIMESTAMPTZ(3),

    CONSTRAINT "bidder_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "required_bid_tier" "BidTier" NOT NULL DEFAULT 'tier_0',
    "minimum_bid_increment_cents" INTEGER NOT NULL DEFAULT 100,
    "minimum_starting_bid_cents" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_events" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "location_name" VARCHAR(200) NOT NULL,
    "instructions" TEXT,
    "start_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "end_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pickup_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seller_display_name" VARCHAR(160) NOT NULL,
    "support_email" VARCHAR(320) NOT NULL,
    "default_winner_payment_window_hours" INTEGER NOT NULL DEFAULT 48,
    "default_runner_up_offer_window_hours" INTEGER NOT NULL DEFAULT 48,
    "timeZone" VARCHAR(80) NOT NULL DEFAULT 'America/New_York',
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_payment_methods" (
    "id" TEXT NOT NULL,
    "code" "PaymentMethodCode" NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "handle" VARCHAR(120),
    "link_url" VARCHAR(500),
    "instructions" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "listing_type" "ListingType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "fixed_price_cents" INTEGER,
    "fulfillment_mode" "FulfillmentMode" NOT NULL,
    "shipping_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "published_at_utc" TIMESTAMPTZ(3),
    "archived_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "public_url" VARCHAR(500) NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'active',
    "start_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "starting_bid_cents" INTEGER NOT NULL,
    "minimum_increment_cents" INTEGER NOT NULL DEFAULT 100,
    "closed_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bidder_user_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'active',
    "is_winning" BOOLEAN NOT NULL DEFAULT false,
    "placed_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "PersonaVerificationStatus" NOT NULL,
    "inquiry_id" VARCHAR(120),
    "verification_template_id" VARCHAR(120),
    "reference_id" VARCHAR(120),
    "decision_summary" TEXT,
    "submitted_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "persona_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "site_payment_method_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'pending_review',
    "external_reference" VARCHAR(120),
    "proof_asset_key" VARCHAR(255),
    "review_notes" TEXT,
    "submitted_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at_utc" TIMESTAMPTZ(3),
    "hold_released_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runner_up_offers" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bid_id" TEXT NOT NULL,
    "offered_to_user_id" TEXT NOT NULL,
    "offered_by_user_id" TEXT NOT NULL,
    "status" "RunnerUpOfferStatus" NOT NULL DEFAULT 'pending',
    "offered_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "responded_at_utc" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "runner_up_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_user_id" TEXT NOT NULL,
    "winning_bid_id" TEXT,
    "runner_up_offer_id" TEXT,
    "source" "OrderSource" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'awaiting_payment',
    "selected_fulfillment_mode" "FulfillmentMode",
    "pickup_event_id" TEXT,
    "shipping_address_text" TEXT,
    "payment_deadline_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "paid_at_utc" TIMESTAMPTZ(3),
    "fulfilled_at_utc" TIMESTAMPTZ(3),
    "cancelled_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "site_payment_method_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "external_reference" VARCHAR(120),
    "proof_asset_key" VARCHAR(255),
    "status" "PaymentReviewStatus" NOT NULL DEFAULT 'pending_review',
    "submitted_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token" VARCHAR(255) NOT NULL,
    "expires_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at_utc" TIMESTAMPTZ(3),
    "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "bidder_profiles_user_id_key" ON "bidder_profiles"("user_id");

-- CreateIndex
CREATE INDEX "bidder_flags_profile_active_idx" ON "bidder_flags"("bidder_profile_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_events_slug_key" ON "pickup_events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "site_payment_methods_code_key" ON "site_payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "listings"("slug");

-- CreateIndex
CREATE INDEX "listings_category_status_idx" ON "listings"("category_id", "status");

-- CreateIndex
CREATE INDEX "listings_seller_status_idx" ON "listings"("seller_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_listing_sort_order_key" ON "listing_images"("listing_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "auctions_listing_id_key" ON "auctions"("listing_id");

-- CreateIndex
CREATE INDEX "auctions_end_status_idx" ON "auctions"("end_at_utc", "status");

-- CreateIndex
CREATE INDEX "bids_auction_placed_at_idx" ON "bids"("auction_id", "placed_at_utc");

-- CreateIndex
CREATE INDEX "bids_bidder_placed_at_idx" ON "bids"("bidder_user_id", "placed_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "persona_verifications_inquiry_id_key" ON "persona_verifications"("inquiry_id");

-- CreateIndex
CREATE INDEX "persona_verifications_user_status_idx" ON "persona_verifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "deposits_user_status_idx" ON "deposits"("user_id", "status");

-- CreateIndex
CREATE INDEX "deposits_status_hold_released_idx" ON "deposits"("status", "hold_released_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "runner_up_offers_bid_id_key" ON "runner_up_offers"("bid_id");

-- CreateIndex
CREATE INDEX "runner_up_offers_auction_status_idx" ON "runner_up_offers"("auction_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_winning_bid_id_key" ON "orders"("winning_bid_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_runner_up_offer_id_key" ON "orders"("runner_up_offer_id");

-- CreateIndex
CREATE INDEX "orders_listing_status_idx" ON "orders"("listing_id", "status");

-- CreateIndex
CREATE INDEX "orders_buyer_status_idx" ON "orders"("buyer_user_id", "status");

-- CreateIndex
CREATE INDEX "payments_order_status_idx" ON "payments"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_exp_idx" ON "email_verification_tokens"("user_id", "expires_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_exp_idx" ON "password_reset_tokens"("user_id", "expires_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_exp_idx" ON "sessions"("user_id", "expires_at_utc");

-- AddForeignKey
ALTER TABLE "bidder_profiles" ADD CONSTRAINT "bidder_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidder_flags" ADD CONSTRAINT "bidder_flags_bidder_profile_id_fkey" FOREIGN KEY ("bidder_profile_id") REFERENCES "bidder_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidder_flags" ADD CONSTRAINT "bidder_flags_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_user_id_fkey" FOREIGN KEY ("bidder_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_verifications" ADD CONSTRAINT "persona_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_site_payment_method_id_fkey" FOREIGN KEY ("site_payment_method_id") REFERENCES "site_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runner_up_offers" ADD CONSTRAINT "runner_up_offers_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runner_up_offers" ADD CONSTRAINT "runner_up_offers_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runner_up_offers" ADD CONSTRAINT "runner_up_offers_offered_to_user_id_fkey" FOREIGN KEY ("offered_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runner_up_offers" ADD CONSTRAINT "runner_up_offers_offered_by_user_id_fkey" FOREIGN KEY ("offered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_winning_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "bids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_runner_up_offer_id_fkey" FOREIGN KEY ("runner_up_offer_id") REFERENCES "runner_up_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_event_id_fkey" FOREIGN KEY ("pickup_event_id") REFERENCES "pickup_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_site_payment_method_id_fkey" FOREIGN KEY ("site_payment_method_id") REFERENCES "site_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
