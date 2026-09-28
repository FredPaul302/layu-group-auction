# Editable deposit tiers and dollar entry

The admin dashboard now links to **Deposit tiers & buyer protection**. The settings page edits the first and second deposit amounts and the no-deposit launch auction limit. Defaults remain $1.00, $20.00, and $40.00. During launch the second tier remains reserved; Buy It Now stays deposit-free.

The current settings drive new bids, runner-up offer acceptance, deposit choices, category labels, the bulk editor, buyer guidance, and the homepage announcement. Existing approved holds count at their actual amounts against current thresholds. Cached tier labels are not used in place of the approved balance. The additive database migration does not alter deposit, bid, payment, or order history.

Listing, category, bulk, bid, and payment forms accept dollar amounts, such as 12.50. AI suggestions fill the same units. Exact decimal parsing converts at the form boundary while all domain calculations and database values remain integer cents. Explicitly named legacy cent form fields and saved bulk batches preserve their values. CSV imports support dollar columns `price`, `startingBid`, and `bidIncrement`; duplicate dollar/cent columns for one field are rejected. Incomplete bulk price edits remain recoverable and cannot be published as valid prices.

Migration: `20260921000200_editable_deposit_tiers`. Apply before deploying the new application. It adds three settings columns and validates positive ordered deposit amounts and a nonnegative auction limit. The previous application remains compatible with the added columns.

Validation and deployment receipts are stored under `.codex-work/tiers-currency-20260921/`. Deployment status will be recorded after the live rollout is verified.

Validation passed: lint, typecheck, 942 tests (5 skipped), deployment configuration checks, and the production build. The test run included local PostgreSQL integration tests. Isolated HTTP tests checked custom tier settings, authorization, deposit review, bidding thresholds, deposit-free Buy It Now, and historical amounts. Browser tests checked the dashboard link, tier saves, category labels, legacy batch recovery, AI price application, and saving/reopening dollar prices. A $12.50 listing with $5.01 shipping persisted as exactly 1250 and 501 cents; an edited bulk price of $21.49 resumed correctly. The new tier panel uses the existing theme-aware surface styling.


Deployed successfully on September 23, 2026 at 08:12:44 UTC. All production traffic uses the new image, with runtime configuration preserved. All 22 production HTTP checks passed across both public addresses with TLS verification. Image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:f811ecc1e395d4d4fa0c6f3c055380f81bc7c5c977d674ed1d97d49834aec958`.

Because C: was full, deployment receipts continued in `D:/CodexTaskTemp/LayuMarket/tiers-currency-20260923/`. The original deployment helper forwards to that folder. Temporary registry credentials were removed and the local preview was stopped.
