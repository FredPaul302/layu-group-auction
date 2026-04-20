# AGENTS.md

## Project Overview

This repository is for a phased build of a single-seller auction website. V1 supports two listing types: `auction` and `fixed_price`. Buyer verification is required before bidding or claiming an item, and payments are handled outside the site through PayPal, Venmo, or Cash App with manual admin confirmation.

The repository is intentionally being built in phases. This phase contains documentation and repo instructions only. Do not scaffold the app, install dependencies, or add product code in this phase.

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

## Testing Rules

- Cover core business rules and status transitions with tests.
- Prefer unit tests for domain services and rules.
- Add focused integration tests for route and API behavior when those surfaces exist.
- Verify money and time handling consistently use integer cents and UTC.
- Include test coverage for verification limits, manual payment review flows, and auction closing outcomes.

## Commands To Run After Changes

After implementation changes in later phases, Codex should run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

These commands are expectations for future implementation work. This documentation-only phase does not add tooling or run them.
