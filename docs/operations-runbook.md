# Operations Runbook

Use this as the short operator guide for local development, staging smoke checks, and production job execution.

## Local Setup

1. Start PostgreSQL:
   `docker compose up -d`
2. Install dependencies:
   `pnpm install`
3. Generate Prisma client:
   `pnpm db:generate`
4. Apply local migrations:
   `pnpm db:migrate`
5. Seed local fixtures:
   PowerShell: `$env:SEED_LOCAL_DEV_DATA='true'; pnpm db:seed`
6. Start the app:
   `pnpm dev`

## Seeded Local Accounts

Default fixture credentials when local seed overrides are not set:

- admin: `admin@local.layu.test` / `DevAdmin123!`
- bidder: `bidder@local.layu.test` / `DevBuyer123!`

Override them with:

- `DEV_SEED_ADMIN_EMAIL`
- `DEV_SEED_ADMIN_PASSWORD`
- `DEV_SEED_USER_EMAIL`
- `DEV_SEED_USER_PASSWORD`

## Dev Email Verification

Keep `EMAIL_DRIVER=console` in local development.

When you register or request a password reset:

1. watch the `pnpm dev` terminal output
2. copy the verification or reset URL from the console email payload
3. open that URL in the browser

This is also how reservation, payment-review, payment-result, and auction-win emails are verified locally.

## Local Job Execution

### CLI

- close auctions: `pnpm auctions:close-expired`
- expire overdue orders and release reservations: `pnpm orders:expire-overdue`
- expire runner-up offers: `pnpm offers:expire`
- reminder stub: `pnpm reminders:send`

### HTTP While `pnpm dev` Is Running

Set `INTERNAL_JOB_SECRET` in `.env`, then invoke:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/close-auctions" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/expire-overdue-payments" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/expire-runner-up-offers" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/send-reminders" -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }
```

## Staging / Production Job Execution

Use the same protected endpoints against the deployed `APP_URL`:

- `POST /api/internal/jobs/close-auctions`
- `POST /api/internal/jobs/expire-overdue-payments`
- `POST /api/internal/jobs/expire-runner-up-offers`
- `POST /api/internal/jobs/send-reminders`

Pass either:

- `x-internal-job-secret: <INTERNAL_JOB_SECRET>`
- `Authorization: Bearer <INTERNAL_JOB_SECRET>`

Suggested scheduler cadence:

- close auctions: every 1 to 5 minutes
- expire overdue orders: every 15 to 60 minutes
- expire runner-up offers: every 15 to 60 minutes
- reminders: leave unscheduled until reminder dedupe is implemented

## Staging Smoke Checklist

- `pnpm deploy:check` passes with staging environment variables
- public site loads at the real staging `APP_URL`
- registration, login, verify-email, and password reset work
- Persona callback and webhook paths are reachable if Persona is enabled
- admin can create and publish auction and fixed-price listings
- image uploads resolve publicly for the selected storage driver
- eligible bidder can place an auction bid
- fixed-price reservation can be created and paid through manual review
- `POST /api/internal/jobs/close-auctions` runs successfully with `INTERNAL_JOB_SECRET`
- `POST /api/internal/jobs/expire-overdue-payments` runs successfully with `INTERNAL_JOB_SECRET`
- console or provider logs show reservation, payment, and auction-win emails being delivered

## Production Readiness Notes

- run `pnpm deploy:check` before every deployment
- production requires `EMAIL_DRIVER=webhook`
- production object storage should set `OBJECT_STORAGE_PUBLIC_BASE_URL`
- production local storage must use a persistent upload directory and an explicit `LOCAL_PUBLIC_UPLOAD_BASE_URL`
- the reminders job is intentionally still a stub and should not be scheduled yet
