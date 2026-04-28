# Layu Group LLC Auction

Layu Group LLC Auction is a phased single-seller marketplace for `auction` and `fixed_price` listings. Verification is mandatory before bidding or claiming, payments stay external through PayPal, Venmo, or Cash App, and admin review remains in the loop for verification, payment, fulfillment, runner-up offers, relisting, and bidder enforcement.

## What This Repo Covers

- Next.js App Router application scaffold in `src/`
- TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Vitest
- Credentials auth with email verification and password reset
- Manual Persona and deposit-verification flows
- Auction, fixed-price, order, payment, and fulfillment domain logic
- Admin surfaces, internal job endpoints, and local development adapters

## Intentionally Out Of Scope In V1

- Multi-seller marketplace behavior
- Scheduled future auction starts exposed in the UI
- Reserve prices
- Proxy bidding
- Soft-close or anti-sniping
- On-site card or processor-driven payment capture
- Tax automation
- Live chat
- Disputes
- Ratings or reputation systems
- Automatic relisting

## Project Docs

- [Auction V1 product notes](docs/auction-v1.md)
- [Route map](docs/route-map.md)
- [Implementation notes](docs/implementation-notes.md)
- [Deployment and operations guide](docs/deployment.md)
- [Operations runbook](docs/operations-runbook.md)
- [Launch checklist](docs/launch-checklist.md)

## Local Setup

1. Install Node.js 24+ and `pnpm`
2. Copy `.env.example` to `.env`
3. Start PostgreSQL with `docker compose up -d`
4. Install dependencies with `pnpm install`
5. Generate Prisma client with `pnpm db:generate`
6. Run the initial migration with `pnpm db:migrate`
7. Seed local data with `pnpm db:seed`
8. Start the app with `pnpm dev`

To create a usable local admin, a normal verified user, and several published sample listings, enable the local fixture seed before running the seed command:

- PowerShell:
  `$env:SEED_LOCAL_DEV_DATA='true'; pnpm db:seed`

Optional local-dev credential overrides:

- `DEV_SEED_ADMIN_EMAIL`
- `DEV_SEED_ADMIN_PASSWORD`
- `DEV_SEED_USER_EMAIL`
- `DEV_SEED_USER_PASSWORD`

Default local-dev fixture credentials when those overrides are not set:

- admin: `admin@local.layu.test` / `DevAdmin123!`
- bidder: `bidder@local.layu.test` / `DevBuyer123!`

After seeding, sign in with the admin account and open `/admin/listings` or `/admin/listings/new` to create and publish additional test inventory.

## Local Fixed-Price Reservation Test

To test the fixed-price Buy It Now reservation flow locally:

1. Seed fixture data:
   PowerShell: `$env:SEED_LOCAL_DEV_DATA='true'; pnpm db:seed`
2. Start the app with `pnpm dev`
3. Sign in as the bidder fixture:
   `bidder@local.layu.test` / `DevBuyer123!`
4. Open `/listings/fixed-price`
5. Click `Custom Arcade Fight Stick`
6. Click `Buy it now`
7. On the confirmation page, click `Reserve item`
8. You should be redirected to `/account/orders/<orderId>/payment?status=claim_created`
9. Because that sample listing is shipping-only, click `Update fulfillment details`, complete the shipping address form, and save
10. Return to `/account/orders/<orderId>/payment`
11. Submit a manual payment with any enabled PayPal, Venmo, or Cash App method
12. You should be redirected back to `/account/orders/<orderId>/payment?status=payment_submitted`
13. Sign in as admin and open `/admin/payments`
14. Approve the submission to finalize the order, or reject it to release the reservation back to the catalog

Expected local behavior:

- Buy It Now changes the listing into a reserved fixed-price order immediately
- The order payment page path is `/account/orders/<orderId>/payment`
- Payment submission creates a pending admin-review record
- Approval finalizes the order and listing
- Rejection or overdue expiry releases the listing back to `published`

## Environment Variables

The main environment groups are:

- Core app config:
  `APP_URL`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `INTERNAL_JOB_SECRET`
- Auth tuning:
  `AUTH_SESSION_COOKIE_NAME`, `AUTH_COOKIE_DOMAIN`, TTL settings, `TERMS_VERSION`
- Persona:
  `PERSONA_TEMPLATE_ID`, `PERSONA_ENVIRONMENT_ID`, `PERSONA_SUBDOMAIN`, `PERSONA_WEBHOOK_SECRET`
- Email:
  `EMAIL_DRIVER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_BEARER_TOKEN`
- Storage:
  `STORAGE_DRIVER`, local upload settings, or `OBJECT_STORAGE_*`
- External payment handles:
  PayPal, Venmo, and Cash App profile fields

Use `EMAIL_DRIVER=console` and `STORAGE_DRIVER=local` for local development. For production, configure a real email delivery path and either object storage or an explicitly managed local-storage strategy.

Run `pnpm deploy:check` before every staging or production deploy. It now fails fast when critical operational configuration is missing or still using development placeholders.

## Database Workflow

- Generate Prisma client:
  `pnpm db:generate`
- Create or apply local development migrations:
  `pnpm db:migrate`
- Apply reviewed production migrations:
  `pnpm db:migrate:deploy`
- Check migration state:
  `pnpm db:migrate:status`
- Seed the local database:
  `pnpm db:seed`

Before production deploys, run the reviewed migration set against the target database and decide whether seed data is appropriate for that environment.

## Deployment Paths

Recommended:

- generic Node hosting
- managed PostgreSQL
- object storage
- webhook email delivery
- scheduler calling protected internal job endpoints

Fallback:

- small VM or VPS using the included `Dockerfile`
- persistent volume if `STORAGE_DRIVER=local`
- the same protected internal job endpoint model for background work

## Background Jobs

CLI commands:

- `pnpm auctions:close-expired`
- `pnpm orders:expire-overdue`
- `pnpm offers:expire`
- `pnpm reminders:send`

Internal endpoints protected by `INTERNAL_JOB_SECRET`:

- `POST /api/internal/jobs/close-auctions`
- `POST /api/internal/jobs/expire-overdue-payments`
- `POST /api/internal/jobs/expire-runner-up-offers`
- `POST /api/internal/jobs/send-reminders`

In production, run the CLI commands from a scheduler or call the internal endpoints with the `x-internal-job-secret` header or `Authorization: Bearer <secret>`.

Each job now returns structured execution data including:

- `startedAtUtc`
- `completedAtUtc`
- `processedCount`
- `skippedCount`
- `errorCount`
- `metrics`

## Local Job Runs And Notification Verification

Local overdue reservation release:

- CLI:
  `pnpm orders:expire-overdue`
- HTTP from PowerShell while `pnpm dev` is running:
  `Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/expire-overdue-payments" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }`

Local auction close processing:

- CLI:
  `pnpm auctions:close-expired`
- HTTP from PowerShell while `pnpm dev` is running:
  `Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/close-auctions" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }`

To verify transactional notifications in development:

- keep `EMAIL_DRIVER=console`
- run `pnpm dev` for route-triggered notifications, or run the CLI job directly
- watch the terminal for the console email payloads

The reminder scheduler entrypoint remains a safe stub for now. Reservation reminder emails are intentionally deferred until the app persists reminder-send markers and can avoid duplicate sends.

## Production Runtime

Production-relevant scripts:

- `pnpm deploy:check`
- `pnpm db:migrate:deploy`
- `pnpm build`
- `pnpm start`

## Deployment Checklist

- Set production-safe values for `APP_URL`, `DATABASE_URL`, `NEXTAUTH_SECRET`, and `INTERNAL_JOB_SECRET`
- Use HTTPS for the public app URL
- Configure email delivery with `EMAIL_DRIVER=webhook` and a reachable delivery endpoint
- Choose storage mode deliberately:
  `local` for managed filesystem storage, or `object` for object storage
- Set `PERSONA_WEBHOOK_SECRET` before accepting Persona webhooks
- Run `pnpm db:generate`
- Apply migrations
- Verify an admin account exists and admin route protection is working
- Configure scheduled execution for auction close, overdue expiry, runner-up expiry, and reminders
- Confirm uploads, webhook handling, and manual payment review flows in a staging environment

More detail lives in [docs/deployment.md](docs/deployment.md).

## Useful Commands

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm deploy:check`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:migrate:deploy`
- `pnpm db:migrate:status`
- `pnpm db:seed`
- `pnpm auctions:close-expired`
- `pnpm orders:expire-overdue`
- `pnpm offers:expire`
- `pnpm reminders:send`
