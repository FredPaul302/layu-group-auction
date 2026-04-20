# Layu Group LLC Auction

This repository is a scaffolded single-seller auction and fixed-price marketplace built in phases. V1 is designed around manual verification, manual admin workflows, and external payment collection through PayPal, Venmo, or Cash App.

The current phase provides the application shell, tooling, route layout, Prisma schema scaffold, development adapters, and background job stubs. Core marketplace behavior is still intentionally unimplemented.

## What This Project Is

- A single-seller marketplace for `auction` and `fixed_price` listings
- An auction flow where listings start immediately when published and require an end date/time
- A verification flow where every user verifies email first, then chooses Persona ID verification or refundable deposit verification
- A manual payment confirmation flow where winners or buyers submit payment details and optional proof for admin review
- A fulfillment model that supports pickup-only, shipping-only, or pickup-or-shipping listings, including pickup events for batch handoff

## Intentionally Out Of Scope In V1

- Multi-seller features
- Scheduled future auction starts in the UI
- Reserve prices
- Proxy bidding
- Soft-close or anti-sniping
- Card processing on-site
- Tax automation
- Live chat
- Disputes
- Ratings
- Automatic relisting

## Built In Phases

This repository is intentionally built in phases:

1. Documentation and repo instructions
2. App scaffold and core schema
3. Authentication and verification
4. Listing, bidding, and fixed-price flows
5. Admin tools, background jobs, and operational polish

The repository is now in phase 2.

## Documents

- [Auction V1 product notes](docs/auction-v1.md)
- [Route map](docs/route-map.md)
- [Implementation notes](docs/implementation-notes.md)

## Local Setup

1. Install Node.js 24+ and `pnpm`
2. Copy `.env.example` to `.env`
3. Start PostgreSQL with `docker compose up -d`
4. Install dependencies with `pnpm install`
5. Generate Prisma client with `pnpm db:generate`
6. Start the app with `pnpm dev`

## Available Commands

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm auctions:close-expired`
- `pnpm orders:expire-overdue`
- `pnpm offers:expire`

## Current Scaffold

- Next.js 16 App Router application in `src/`
- TypeScript, Tailwind CSS, ESLint, and Vitest
- Prisma schema scaffold targeting PostgreSQL
- `docker-compose.yml` for local Postgres
- Placeholder public, account, admin, and API routes based on the route map
- Storage and notification adapter interfaces with local development implementations
- Stubbed background job entry points for auction closing, overdue orders, and runner-up offer expiry
