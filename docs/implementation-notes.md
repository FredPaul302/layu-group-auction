# Implementation Notes

This document captures recommended implementation direction for later phases. It does not authorize scaffolding or dependency installation in the current phase.

## Suggested Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind
- Vitest

## Architecture Notes

- Keep domain logic in services or modules that are independent from the UI layer.
- Treat the web UI as a client of the domain layer rather than the place where auction rules live.
- Keep a `seller_user_id` field on listings even though V1 is single-seller.
- Store money as integer cents everywhere.
- Store timestamps in UTC everywhere.
- Keep verification, payment review, auction closing, and fulfillment state transitions explicit and testable.
- Model manual external-payment submission as first-class application data, separate from any processor integration.

## Verification Notes

- Require email verification for every account before any bidding or fixed-price claiming.
- After email verification, offer two paths:
  - Persona identity verification
  - manual refundable deposit verification
- Deposit tiers are `$5`, `$10`, and `$20`, and approval is manual.
- Persona-approved users get full bidding eligibility.
- Deposit-approved users are limited to their approved tier and any category rules derived from it.
- Do not store raw Persona document images in the app database.
- Prefer storing only the minimum Persona reference data needed for status reconciliation and auditability.

## Payments And Fulfillment Notes

- Do not implement card processing on-site in V1.
- PayPal, Venmo, and Cash App are manual external-payment submission methods, not processor APIs.
- The system should capture payer-entered payment details plus optional screenshot or proof metadata for admin review.
- Admin approval or rejection should be explicit and auditable.
- Winner or buyer payment deadlines should default to 48 hours.
- Runner-up offers should also default to a 48-hour response window.
- Fulfillment should support `pickup_only`, `shipping_only`, and `pickup_or_shipping`.
- Shipping is flat-fee only in V1.
- Pickup events should exist as schedulable entities that can group multiple paid items.

## Background Services

- Implement auction closing as an idempotent domain service plus a runnable script or job.
- Implement overdue payment expiry as an idempotent domain service plus a runnable script or job.
- Implement runner-up offer expiry as an idempotent domain service plus a runnable script or job.
- Keep these jobs safe to rerun and able to recover from partial failures without double-processing outcomes.

## Suggested Future Implementation Order

1. Define schema and domain models
2. Add authentication and email verification
3. Build verification flows and admin review tools
4. Implement listing read experience and category access rules
5. Implement bidding and fixed-price claim flows
6. Add payment submission and fulfillment selection
7. Add admin moderation, relist, and runner-up workflows
8. Add background jobs for auction closing and overdue expiry
