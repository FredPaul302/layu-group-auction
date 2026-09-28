# Photo previews, AI titles, and automatic SKUs — September 13, 2026

## Changes

- Selected and saved item photos have thumbnails with filename labels and an enlarged view. Bulk rows show their assigned photos beside the item fields; the media assignment pool also shows previews.
- One AI request drafts both the title and description. Both are previewed and applied together only after review. Changed item facts or photos invalidate a stale draft. Existing provider, model, request limits, and quota controls remain in place.
- Blank listing SKUs receive database-assigned numbers from `000001` through `999999`. Custom SKUs are optional. Assigned numbers persist across edits; newly created copies/duplicates/relistings receive new numbers. Legacy listings receive a number when next saved.
- The admin listing list and detail screen display the SKU. Bulk CSV no longer requires an SKU column. Explicit SKUs are reserved first within a bulk transaction, and results retain the user's row order.

## Database and compatibility

Migration `20260913000300_listing_skus` adds a nullable listing SKU column, a seller/SKU unique index, and a bounded PostgreSQL sequence with an assignment trigger. It does not renumber existing listings or alter inventory balances, orders, or users. Inserts from the previous app revision also receive automatic SKUs during rollout. Numbers can have gaps after failed transactions; they are not reused. The sequence does not wrap at its six-digit limit.

The listing identifier and the Inventory stock SKU serve separate records; existing inventory allocations remain explicit. Retain the migration on application rollback so assigned identifiers survive.

## Verification

- Full application suite: 680 tests passed. Five opt-in PostgreSQL tests also passed separately in an isolated, automatically removed local test database.
- PostgreSQL tests cover first numbering, parallel inserts, collision skipping, saved-number stability, deletion/rollback gaps, and the six-digit limit.
- Lint, type checking, deployment configuration checks in local and production environments, and local migration passed. The production build and clean Docker build also passed; the released image matches the final application source.
- Bulk browser fixture verified immediate thumbnails, enlarged images, title/description Apply, stale-edit protection, sequential requests, and mobile layout using synthetic photos and mocked AI responses.
- Single-item browser fixture verified photo previews, enlarged images with Escape and focus restoration, paired AI suggestions, stale-edit protection, cancellation, and object URL cleanup.
- One real Gemini call using public demonstration artwork returned a valid title and description. No item was published and no customer image was used.
- Read-only production browser checks passed for the bulk uploader, new-listing form, and an existing listing editor. The live forms expose the paired AI workflow and optional automatic SKU; saved photos load as thumbnails and in the enlarged dialog. No production upload, generation, or save was performed during this UI check.

## Rollout

The image is published as `upload-tools-20260913-1734`, digest `sha256:4e662e35ce2cee18617d8707b81387adc49dada98d11c5fa51c278ccba21301e`. Production migration completed successfully in the stopped one-off maintenance task `c36f3eac6072499aa7af7ffec93cb1c7`, exit code 0. Readiness checks confirmed the SKU trigger and unique index, the unconsumed sequence at `000001`, and enabled Gemini configuration. No listing was created by this check.

The application rollout started on September 13 at 21:36 UTC and completed successfully at **21:46:07 UTC**, deployment `0JYiW2lVPBwoBVHXY7IuS`. Task-definition revision **27** is serving 100% of traffic on `default/layu-auction-web-beta` at https://auction.layu.llc. The running container digest matches the released image; final capacity checks show desired 1, running 1, pending 0, and zero failed tasks. The previous server stopped after traffic moved.

The previous image is `sha256:871448401819dbe2804d8e75d94a563cd237fb3f3f36193172dc262c782b13e3`, task-definition revision 26. A comparison of the active configurations during rollout confirmed that roles, networking, health checks, capacity, and runtime configuration were preserved; only the image changed.

## Existing limitation

General buyer emails still require AWS SES production approval; the existing account is in the sandbox. This release does not change email approval or billing settings.
