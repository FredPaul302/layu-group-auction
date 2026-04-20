# Route Map

These are proposed routes for a future Next.js App Router implementation. They describe the intended surface area only. No routes are scaffolded in this phase.

## Public Routes

- `/`
  - marketplace home
- `/listings`
  - browse and search listings
- `/categories/[slug]`
  - category listing page
- `/listings/[listingId]`
  - listing detail page for auction or fixed-price item
- `/listings/[listingId]/claim`
  - fixed-price claim entry point
- `/help/payments`
  - buyer payment instructions
- `/help/verification`
  - verification overview
- `/help/pickup-shipping`
  - fulfillment guidance

## Account Routes

- `/auth/sign-in`
  - sign-in placeholder
- `/auth/sign-up`
  - sign-up placeholder
- `/auth/verify-email`
  - email verification notice and resend flow
- `/account`
  - account home
- `/account/verification`
  - verification overview and current status
- `/account/verification/persona`
  - Persona verification start or return page
- `/account/verification/deposit`
  - deposit verification instructions and submission
- `/account/eligibility`
  - approved tier and category access summary
- `/account/bids`
  - active bids and past auction results
- `/account/offers`
  - runner-up offers and response status
- `/account/purchases`
  - fixed-price claims and winning items
- `/account/payments/[paymentId]`
  - payment submission and review status
- `/account/fulfillment/[listingId]`
  - shipping or pickup selection and status

## Admin Routes

- `/admin`
  - admin dashboard
- `/admin/listings`
  - listing index and filters
- `/admin/listings/new`
  - create listing
- `/admin/listings/[listingId]`
  - listing detail and actions
- `/admin/listings/[listingId]/edit`
  - edit listing
- `/admin/categories`
  - category management and tier requirements
- `/admin/bids`
  - bid history and auction monitoring
- `/admin/verifications`
  - verification review queue
- `/admin/verifications/[verificationId]`
  - verification detail and decision page
- `/admin/payments`
  - payment review queue
- `/admin/payments/[paymentId]`
  - payment review detail
- `/admin/offers`
  - runner-up offer management
- `/admin/pickup-events`
  - pickup event list and scheduling
- `/admin/pickup-events/new`
  - create pickup event
- `/admin/users/[userId]`
  - bidder enforcement, non-paying notes, and blocking actions

## API Routes

- `/api/auth/[...nextauth]`
  - auth and session placeholder
- `/api/auth/verify-email`
  - email verification callback or confirmation
- `/api/persona/webhook`
  - Persona webhook receiver
- `/api/verifications/deposit`
  - submit deposit verification details
- `/api/verifications/deposit/[verificationId]/review`
  - admin deposit approval or rejection
- `/api/listings/[listingId]/bids`
  - place auction bid
- `/api/listings/[listingId]/claim`
  - claim fixed-price listing
- `/api/payments`
  - submit external payment details and optional proof
- `/api/payments/[paymentId]/review`
  - admin accept or reject payment submission
- `/api/fulfillment/[listingId]`
  - choose pickup or shipping and update status
- `/api/admin/listings/[listingId]/publish`
  - publish listing immediately
- `/api/admin/listings/[listingId]/relist`
  - relist same settings or relist with edits
- `/api/admin/listings/[listingId]/archive`
  - archive listing
- `/api/admin/listings/[listingId]/runner-up-offer`
  - create manual runner-up offer
- `/api/admin/users/[userId]/block`
  - block non-paying or disallowed user

## Background / Cron Scripts And Endpoints

Use idempotent domain services behind these future jobs:

- `scripts/close-auctions`
  - finds ended auctions, determines highest valid bidder, or marks item unsold
- `scripts/expire-overdue-payments`
  - marks overdue winner or buyer payments after the default 48-hour deadline
- `scripts/expire-runner-up-offers`
  - closes manual runner-up offers once their response window expires
- `scripts/send-reminders`
  - optional reminders for pending payment and upcoming pickup windows

If HTTP-triggered jobs are needed later, mirror them with internal admin-only endpoints such as:

- `/api/internal/jobs/close-auctions`
- `/api/internal/jobs/expire-overdue-payments`
- `/api/internal/jobs/expire-runner-up-offers`
- `/api/internal/jobs/send-reminders`
