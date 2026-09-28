# AGENTS.md

## Project Overview

This repository is a working Next.js App Router auction platform for a single-seller V1. It supports `auction` and `fixed_price` listings, bidder auth, admin workflows, manual external payments, verification, fulfillment, runner-up offers, and protected internal jobs.

Local development uses Prisma with PostgreSQL from Docker Compose. App code lives under `src/`, database schema and migrations live under `prisma/`, operational scripts live under `scripts/`, and operator documentation lives under `docs/`.

This repository also contains the `aws-cost-guard` Python CLI under `src/aws_cost_guard/`. It is a read-only AWS cost audit and reporting tool for identifying likely recurring AWS charges and waste.

## Current App Surfaces

- Auth, sessions, registration, login, logout, email verification, and password reset
- Admin-only listing, category, payment, order, verification, runner-up offer, and bidder enforcement flows
- Public catalog and listing pages for auction and fixed-price inventory
- Buyer bidding, fixed-price reservation, fulfillment selection, manual payment submission, and proof uploads
- Persona hosted verification return handling and signed webhook processing
- Manual deposit verification and admin review
- Internal job routes for closing auctions, expiring overdue payments, expiring runner-up offers, and reminder entrypoints
- Local storage and object-storage adapter boundaries

## Hard Non-Goals

The following are explicitly out of scope for V1:

- Multi-seller marketplace features
- Scheduled future auction starts exposed in the UI
- Reserve prices
- Proxy bidding
- Soft-close or anti-sniping rules
- On-site card processing
- Tax automation
- Live chat
- Dispute workflows
- Rating or reputation systems
- Automatic relisting

## Coding Rules

- Keep domain logic separate from UI concerns.
- Keep the AWS cost audit implementation read-only in V1. Do not add stop, delete, resize, release, or modify actions to `aws-cost-guard audit`.
- Keep AWS Cost Explorer calls in `us-east-1` and group cost data by `SERVICE` and `USAGE_TYPE`.
- Use normal AWS SDK credential resolution for the Python tool. Do not hardcode credentials, inspect `.env` values, or print secrets.
- The `aws-cost-guard budget` command must remain dry-run by default and require `--apply` before calling AWS Budgets mutation APIs.
- Preserve a `seller_user_id` field even though V1 is single-seller.
- Store all money values as integer cents.
- Store all timestamps in UTC.
- Do not store raw Persona document or ID images in the app database.
- Verification is admin configurable: email is always verified first; Level 1 permits capped email-only access in non-ID-only categories, Level 2 permits capped access with an approved deposit or hosted identity, and Level 3 uses the existing category deposit tiers or hosted identity. Blocks and non-payment restrictions override every level. Apply the selected policy to new bids, fixed-price purchases, and runner-up offers; keep existing orders payable.
- Deposit tiers default to `$1.00` and `$20.00`, with a `$40.00` no-deposit auction limit. Admins can edit both deposit amounts and the launch auction limit. Read the current site settings for enforcement, labels, and deposit choices; preserve actual historical deposit amounts. Launch access requires verified email, permits bids at or below the configured limit without a deposit, and requires approved account deposits totaling at least the first tier above that limit across all categories. The second tier is reserved for later during launch. Buy It Now always requires verified email and no deposit at any price; account blocks/non-payment restrictions still apply. Saved verification levels apply to auctions and runner-up offers when launch access is off. Display and accept monetary amounts in dollars with two decimal places; keep integer cents in storage and domain logic. Preserve explicitly marked legacy cent forms and saved batches without guessing their units.
- Auctions may also have a Buy It Now price above their starting bid. Buy It Now reserves the item and ends bidding atomically; failed combined reservations require manual relisting, never automatic auction restart.
- External payments are recorded as user-submitted payment details and optional proof, not processor-driven captures.
- Prefer small, reviewable commits and diffs.
- Do not inspect or print `.env` or `.env.local` values.
- Never run `docker compose down -v` unless the user explicitly requests it.

## Testing Rules

- Cover core business rules and status transitions with tests.
- Python AWS tests must not call live AWS. Use `botocore.stub.Stubber`, fakes, or mocks.
- Add at least one rule test for each major AWS cost finding category when changing `aws-cost-guard` rules.
- Prefer unit tests for domain services and rules.
- Add focused integration tests for route and API behavior when those surfaces change.
- Verify money and time handling consistently use integer cents and UTC.
- Include test coverage for verification limits, manual payment review flows, and auction closing outcomes.

## Commands To Run After Changes

After implementation changes, run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm deploy:check`

After Python CLI changes, also run:

- `python -m pytest tests/aws_cost_guard`
- `python -m ruff check src/aws_cost_guard tests/aws_cost_guard`

For deployment-readiness or build-related changes, also run `pnpm build` and, when Docker is in scope, `docker build --no-cache -t layu-auction:docker-smoke .`.
