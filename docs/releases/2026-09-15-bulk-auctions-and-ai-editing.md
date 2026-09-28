# Bulk auction closing time and AI condition/editing

## Release status

Completed September 15, 2026, at **10:03:58 PM Eastern** (September 16,
02:03:58 UTC). AWS reported **SUCCESSFUL** with 100% of production traffic.
Verified the final image and unchanged runtime configuration at 03:53:30 UTC.

- Site: https://market.layu.llc
- Deployment: `iBEaeLS5dRv5zv0_FjcSv`.
- Service revision: `9590476438095208217`.
- Image tag: `bulk-auctions-20260915-2153`.
- Image digest: `sha256:ff1e6983232094c3c5e133ea449a569ac38773d1555c91770bf30536ed644f01`.
- Previous image: `sha256:8639cb2956bbe7e6f42bb40615dfb2e877b79f376517bafa97a8098fcd4235e5`.
- Migration task: `8d1373cd55a4461cb1de33c3098e8c67`, exit code 0.

## Changes

- Bulk listings default to one shared auction ending ten days from opening the
  workspace. Operators can choose a duration in days, hours, or minutes (at least
  one minute), or an exact local date/time. New, duplicated, and CSV auction rows
  share the selected end. Fixed-price rows are unaffected. Unchecking the option
  restores individual row dates. The chosen end stays fixed during upload and
  publication; drafts are not published automatically. Existing listings are not
  rescheduled. Dates are saved in UTC.
- Category choices show $1/$20 tiers. Migration
  `20260915000100_category_tier_labels` updates only the original seed names and
  descriptions, preserving category IDs, URLs, custom names, and deposit history.
  The production audit confirmed Collectibles and Vintage at tier_1 and Premium
  at tier_20. Launch rules continue to reserve $20 for later.
- AI drafts include an estimated condition with title, description, and optional
  price. **Apply all suggestions** fills those fields together. A combined
  auction/Buy It Now listing keeps its independently entered Buy It Now price.
- Both editors support direct description changes and **AI editing instructions**.
  A reviewed revision changes only the description. Known defects and testing
  uncertainty must be retained. No-photo revisions work with a title and existing
  description. Suggestions remain subject to seller review.
- Adding more media preserves earlier manual assignments and cover order.
  The explicit Auto-match command still rematches the whole batch.

## Validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm deploy:check` passed.
  Final normal suite: **769 passed**, 11 existing opt-in database tests skipped.
- Local production build and a clean Docker build passed. The final Docker build,
  after the additional-media fix, reused unchanged dependency layers and passed.
  The shipped image matched 250 application/schema/public/script file hashes.
- Isolated PostgreSQL/browser testing saved two draft items with exactly
  `2026-09-30T22:00:00Z` (September 30, 6 PM Eastern), retaining their condition
  notes and 1000/2500-cent starting bids. Browser checks covered the ten-day
  default, custom duration, exact date, tier labels, bulk Apply all, and revisions.
- Final-image browser checks confirmed sequential uploads retain an earlier photo
  assignment. Single-item Apply all filled estimated condition and a 2500-cent
  starting bid while preserving the 9000-cent Buy It Now price; description-only
  revision preserved all other fields.
- AI tests used synthetic provider responses in an isolated preview, with both
  adapters covered by automated tests. No real provider calls or production test
  listings were created for this release. The preview adapter was mounted only
  into the test container and is excluded from the shipped image.
- Twelve live HTTPS checks passed across both current load-balancer addresses,
  using normal certificate validation: homepage, catalog, renamed categories,
  login, and protected bulk-admin redirect. The live browser also confirmed that
  bulk admin access requires sign-in; authenticated editor testing was local.
- The web deployment changed only the image. Runtime configuration, secret
  references, roles, networking, capacity, and domain routing matched the baseline.

## Local environment notes

Docker initially failed on stale runtime socket directories following a restart.
Its runtime directories were preserved as dated backups before restarting Docker;
source files and database volumes were retained. Test browser tabs were closed.
At final follow-up Docker was stopped, so removal of the two named preview
containers (`layu-bulk-preview-20260915`, `layu-bulk-preview-final-20260915`) and the
isolated `layu_bulk_preview_20260915` database was deferred. They contain only
synthetic test data and are not part of production.

See the [admin guide](../market-admin-guide.md) and
[AI editing guide](../ai-listing-descriptions.md) for usage.
