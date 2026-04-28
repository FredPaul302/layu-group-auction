# AGENTS.md

## Project Overview

This repository is a working Next.js App Router auction platform for a single-seller V1. It supports `auction` and `fixed_price` listings, bidder auth, admin workflows, manual external payments, verification, fulfillment, runner-up offers, and protected internal jobs.

Local development uses Prisma with PostgreSQL from Docker Compose. App code lives under `src/`, database schema and migrations live under `prisma/`, operational scripts live under `scripts/`, and operator documentation lives under `docs/`.

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
- Preserve a `seller_user_id` field even though V1 is single-seller.
- Store all money values as integer cents.
- Store all timestamps in UTC.
- Do not store raw Persona document or ID images in the app database.
- Model verification so users must verify email first, then complete either Persona verification or manual deposit verification.
- Deposit verification is manual and tiered at `$5`, `$10`, or `$20`.
- External payments are recorded as user-submitted payment details and optional proof, not processor-driven captures.
- Prefer small, reviewable commits and diffs.
- Do not inspect or print `.env` or `.env.local` values.
- Never run `docker compose down -v` unless the user explicitly requests it.

## Testing Rules

- Cover core business rules and status transitions with tests.
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

For deployment-readiness or build-related changes, also run `pnpm build` and, when Docker is in scope, `docker build --no-cache -t layu-auction:docker-smoke .`.
