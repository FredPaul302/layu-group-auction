# Deployment Runbook

## Deployment Shapes

### Recommended Path

Use a generic managed Node hosting setup with:

- a managed PostgreSQL database
- object storage for uploads
- webhook-based email delivery
- HTTPS on the public app URL
- an external scheduler that calls the protected internal job endpoints

This keeps the runtime simple: the app serves traffic, the database stores state, object storage handles uploads, and the scheduler triggers background work over HTTP with `INTERNAL_JOB_SECRET`.

### Fallback Path

Use a small VM or VPS with the included [Dockerfile](../Dockerfile), a persistent volume for uploads if `STORAGE_DRIVER=local`, and either:

- managed PostgreSQL, or
- a separately operated PostgreSQL instance

For the fallback path, the easiest scheduler model is still HTTP calls to the internal job endpoints from cron or a small host-level scheduler.

## Production Environment Setup

Set these before the first production boot:

### Always Required

- `APP_URL`
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `INTERNAL_JOB_SECRET`
- `TERMS_VERSION`

### Authentication And Session

- `AUTH_SESSION_COOKIE_NAME`
- `AUTH_COOKIE_DOMAIN` if cookies must be shared across subdomains
- TTL settings if defaults are not acceptable

### Email

Production is expected to use:

- `EMAIL_DRIVER=webhook`
- `EMAIL_FROM`
- `EMAIL_WEBHOOK_URL`

Optional:

- `EMAIL_REPLY_TO`
- `EMAIL_WEBHOOK_BEARER_TOKEN`

### Storage

Choose one:

1. `STORAGE_DRIVER=object`
   - `OBJECT_STORAGE_BUCKET`
   - `OBJECT_STORAGE_REGION`
   - `OBJECT_STORAGE_ENDPOINT`
   - `OBJECT_STORAGE_ACCESS_KEY_ID`
   - `OBJECT_STORAGE_SECRET_ACCESS_KEY`
   - `OBJECT_STORAGE_PUBLIC_BASE_URL`
   - optional `OBJECT_STORAGE_FORCE_PATH_STYLE`
2. `STORAGE_DRIVER=local`
   - `LOCAL_UPLOAD_DIR`
   - `LOCAL_PUBLIC_UPLOAD_BASE_URL`
   - a persistent writable volume mounted at the upload directory

### Persona

If Persona is enabled:

- `PERSONA_TEMPLATE_ID`
- `PERSONA_ENVIRONMENT_ID` if used
- `PERSONA_SUBDOMAIN` if not using the default
- `PERSONA_WEBHOOK_SECRET`

`PERSONA_API_KEY` is reserved for future server-to-server Persona API calls. The current app does not consume it for hosted redirects or signed webhook verification, so do not treat it as required today.

### External Payment Handles

- `PAYPAL_ME_URL`
- `VENMO_HANDLE` and `VENMO_PROFILE_URL`
- `CASH_APP_CASHTAG` and `CASH_APP_PROFILE_URL`

## Preflight Validation

Before the first deploy, run:

```bash
pnpm install --frozen-lockfile
pnpm deploy:check
```

`pnpm deploy:check` validates the runtime shape and prints a small deployment summary. In production mode it now fails if critical operational settings are missing, including database access, auth secrets, internal job security, email delivery, and storage-public-URL requirements.

For Docker-based releases, run a clean image build smoke test before promoting the image:

```bash
docker build --no-cache -t layu-auction:docker-smoke .
```

For the short operator checklist and exact local job commands, keep [operations-runbook.md](operations-runbook.md) nearby.

## Database Migration Flow

### First Production Release

1. Install dependencies:
   `pnpm install --frozen-lockfile`
2. Validate configuration:
   `pnpm deploy:check`
3. Generate Prisma client:
   `pnpm db:generate`
4. Apply reviewed migrations:
   `pnpm db:migrate:deploy`
5. Seed only if the environment should receive seed data:
   `pnpm db:seed`
6. Build:
   `pnpm build`
7. Start:
   `pnpm start`

### Normal Release

1. Pull the new release
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm deploy:check`
4. Run `pnpm db:migrate:deploy`
5. Run `pnpm build`
6. Restart with `pnpm start`

Use `pnpm db:migrate:status` when you want a quick view of migration state before or after deployment.

## Build And Runtime Models

### Generic Node Host

Production deploy sequence:

```bash
pnpm install --frozen-lockfile
pnpm deploy:check
pnpm db:migrate:deploy
pnpm build
pnpm start
```

### Docker Fallback

Build the image:

```bash
docker build -t layu-group-auction .
```

Run it with your environment file:

```bash
docker run --env-file .env.production -p 3000:3000 layu-group-auction
```

If you keep `STORAGE_DRIVER=local`, mount a persistent volume for `LOCAL_UPLOAD_DIR`. If you use object storage, no upload volume is needed.

For containerized deployments, prefer running background work through the protected internal job endpoints instead of shelling into the running container.

## Production External Dependencies

Confirm these are provisioned before launch:

- managed PostgreSQL
- object storage or a persistent upload volume
- email webhook bridge or production email service
- scheduler or cron invoking protected internal job routes
- real PayPal, Venmo, and Cash App handles/URLs
- Persona webhook configured and `PERSONA_WEBHOOK_SECRET` set
- `APP_URL` set to the public HTTPS origin
- durable rate limiter before multi-instance production

## Email Configuration

Production email uses the webhook adapter boundary. The app does not require a specific provider, but it does require a reachable webhook-style delivery endpoint.

The webhook should accept a JSON payload with:

- `to`
- `subject`
- `text`
- `from`
- `replyTo`

Local development can keep `EMAIL_DRIVER=console`.

## Storage Configuration

### Object Storage

Use this for the recommended production path. Public uploads should resolve through `OBJECT_STORAGE_PUBLIC_BASE_URL`, which can point directly at a public bucket endpoint or a CDN.

### Local Storage

Keep this for local development or only if the production runtime has:

- persistent writable storage
- a stable upload mount
- `LOCAL_PUBLIC_UPLOAD_BASE_URL` set to the public HTTPS path that serves those files

## Persona Webhook Setup

Configure Persona to send webhooks to:

- `POST /api/persona/webhook`

Hosted Persona returns should be allowed to hit:

- `GET /api/verifications/persona/callback`

Before turning Persona on in production:

- set `PERSONA_WEBHOOK_SECRET`
- verify the webhook can reach the app over HTTPS
- confirm the callback URL uses the real `APP_URL`

## Internal Job Secret Setup

Set a long random `INTERNAL_JOB_SECRET`. This secret protects:

- `POST /api/internal/jobs/close-auctions`
- `POST /api/internal/jobs/expire-overdue-payments`
- `POST /api/internal/jobs/expire-runner-up-offers`
- `POST /api/internal/jobs/send-reminders`

The app accepts either:

- `x-internal-job-secret: <secret>`
- `Authorization: Bearer <secret>`

## Scheduler And Job Invocation Model

### Recommended Scheduler Shape

Use your host scheduler, VM cron, CI scheduler, or lightweight automation platform to call the internal job endpoints over HTTPS.

Suggested frequencies:

- close auctions: every 1 to 5 minutes
- expire overdue orders: every 15 to 60 minutes
- expire runner-up offers: every 15 to 60 minutes
- reminders: hourly or twice daily once reminder behavior is implemented

Current job status:

- `close-auctions` is implemented
- `expire-overdue-payments` is implemented
- `expire-runner-up-offers` is implemented
- `send-reminders` is a stub/no-op until reminder-send dedupe is implemented

### CLI Job Commands

These are useful when the deployment platform supports running shell commands against the app checkout:

- `pnpm auctions:close-expired`
- `pnpm orders:expire-overdue`
- `pnpm offers:expire`
- `pnpm reminders:send`

Each job returns structured execution data with `startedAtUtc`, `completedAtUtc`, `processedCount`, `skippedCount`, `errorCount`, and job-specific `metrics`.

`pnpm reminders:send` is currently a safe no-op stub. It returns a stub status and sends nothing until reminder logic is implemented with persisted reminder-send dedupe.

### HTTP Job Calls

#### curl

```bash
curl -X POST "https://your-app.example.com/api/internal/jobs/close-auctions" \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
```

```bash
curl -X POST "https://your-app.example.com/api/internal/jobs/expire-overdue-payments" \
  -H "Authorization: Bearer $INTERNAL_JOB_SECRET"
```

```bash
curl -X POST "https://your-app.example.com/api/internal/jobs/expire-runner-up-offers" \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
```

```bash
curl -X POST "https://your-app.example.com/api/internal/jobs/send-reminders" \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
```

#### PowerShell

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-app.example.com/api/internal/jobs/close-auctions" `
  -Headers @{ "x-internal-job-secret" = $env:INTERNAL_JOB_SECRET }
```

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-app.example.com/api/internal/jobs/expire-overdue-payments" `
  -Headers @{ Authorization = "Bearer $($env:INTERNAL_JOB_SECRET)" }
```

## Post-Deploy Smoke Checks

Run the smoke checks in [launch-checklist.md](launch-checklist.md) after every first deploy to a new environment and after any release that touches auth, verification, bidding, orders, or operational flows.

At minimum confirm:

- the public site loads over HTTPS
- login and registration work
- uploads work for the selected storage driver
- internal job endpoints accept the configured secret
- Persona callback and webhook paths are reachable

## Operational Notes

- `pnpm start` is the production runtime entrypoint
- `pnpm db:migrate:deploy` is the production migration command
- `pnpm db:seed` should be a deliberate operator action, not an automatic startup step
- background jobs should be scheduled explicitly, not run inside the web request path
- local development remains intentionally easy with `EMAIL_DRIVER=console` and `STORAGE_DRIVER=local`
- with `EMAIL_DRIVER=console`, reservation, payment-review, payment-result, and auction-win notifications are visible in application or job-process logs during local testing
