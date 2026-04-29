# Launch Checklist

Use this for staging sign-off and the first production launch.

## Access And Auth

- Create the first usable admin with `pnpm admin:create -- --email <operator-admin-email>` if one does not already exist
- Confirm local fixture credentials were not used for staging or production admin access
- Open the public app over the real `APP_URL`
- Register a new bidder account
- Log in with the new account
- Request a password reset
- Complete a password reset
- Verify email from the delivered verification message

## Persona And Deposit Verification

- Start the Persona hosted flow
- Confirm the hosted callback returns to the app
- Confirm the Persona webhook reaches `/api/persona/webhook`
- Confirm Persona approval updates bidder eligibility
- Create a deposit draft for each supported tier if needed
- Submit a deposit proof item
- Review and approve a deposit from admin

## Listings And Catalog

- Sign in as admin
- Create a category if needed
- Create a pickup event
- Create a listing with images
- Publish an auction listing
- Publish a fixed-price listing
- Confirm both appear in the public catalog

## Bidding And Auction Close

- Place at least one valid bid from an eligible account
- Confirm ineligible or blocked accounts still cannot bid
- Run `pnpm auctions:close-expired` or trigger `POST /api/internal/jobs/close-auctions`
- Confirm the winning order is created only once
- Confirm a no-bid auction closes as unsold

## Payments And Orders

- Submit external payment proof for an order
- Review and confirm payment from admin
- Reject a payment submission and verify the audit trail remains visible
- Run `pnpm orders:expire-overdue` or trigger `POST /api/internal/jobs/expire-overdue-payments`
- Confirm overdue orders move correctly without duplicate transitions

## Runner-Up Offers

- Create a manual runner-up offer from admin
- Accept or decline a runner-up offer from the bidder view
- Run `pnpm offers:expire` or trigger `POST /api/internal/jobs/expire-runner-up-offers`
- Confirm expired offers do not create duplicate orders

## Fulfillment

- Select pickup for a `pickup_or_shipping` order
- Select shipping and submit the shipping address
- Mark the order ready for fulfillment
- Mark the order fulfilled
- Mark the order completed

## Scheduler And Operations

- Trigger each protected internal job endpoint with `INTERNAL_JOB_SECRET`
- Confirm `close-auctions`, `expire-overdue-payments`, and `expire-runner-up-offers` process real or staged records correctly
- Confirm the reminders endpoint responds safely even though `send-reminders` is still a stub/no-op
- Confirm logs show clean operator-facing errors for missing or invalid configuration
- Confirm uploads persist across restarts for the selected storage mode

## External Dependencies

- Managed PostgreSQL is provisioned and reachable
- Object storage or a persistent upload volume is provisioned
- Email webhook bridge or production email service is configured
- Scheduler or cron is ready to call protected internal job routes
- Real payment handles and URLs are configured
- Persona webhook is configured and `PERSONA_WEBHOOK_SECRET` is set
- `APP_URL` uses the public HTTPS origin
- Durable rate limiting is planned before multi-instance production

## Final Go-Live Checks

- `pnpm deploy:check` passes in the target environment
- `pnpm lint` passes on the release commit
- `pnpm typecheck` passes on the release commit
- `pnpm test` passes on the release commit
- `pnpm build` passes on the release commit
- `docker build --no-cache -t layu-auction:docker-smoke .` passes when Docker is part of the release path
- Admin user exists and can access admin routes
- `pnpm db:seed:local` was not run against the production-like database
- Payment handles and public help copy match the real seller accounts
