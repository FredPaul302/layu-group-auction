# Large batches from the photo inbox

## Changes

- Saved inbox photos can be used in a single bulk workspace totaling up to 1 GiB (shown as 1 GB), across up to 100 listing rows.
- Selecting saved photos adds their identifiers and metadata immediately. The browser no longer downloads every original and re-uploads them together when saving listings.
- The bulk endpoint resolves photo ownership, size, filename, type, and storage location from the database. Client-supplied storage metadata is not accepted. Missing photos, foreign-account photos, repeated photo references, and media-ID collisions are rejected.
- The server copies originals one at a time before the listing transaction. Listing copies have independent storage keys; deleting an inbox photo does not affect a listing. Failed batches clean up only their new copies.
- AI drafting loads the active item's selected photos on demand. It does not preload every original in the batch.
- New upload transfers remain capped at 256 MiB; photos remain capped at 20 MiB each and videos at 50 MiB. Upload larger collections to the inbox in smaller selections, then select them together in the bulk workspace. A listing still supports up to eight photos and one video.
- No database migration or hosting capacity increase is needed.

## Validation

- Lint, type checking, deployment checks, the production build, and a clean Docker build passed.
- 873 automated tests passed; 11 opt-in database tests were skipped. Added coverage includes workspace and transfer limits, ownership, rollback cleanup, reference parsing, duplicate references, and lazy AI photo loading.
- All 269 checked application/configuration files match the release image.
- An isolated 1 GiB preview container accepted 58 real 10 MiB JPEG files, totaling 580 MiB (608,174,080 bytes). Through the browser, Select all added the complete collection, a CSV assigned it to 58 rows, and one action saved all 58 drafts with one shared auction end.
- Every listing copy matched its inbox original's byte count and SHA-256 hash. All originals remained present after draft creation. The preview stayed running without an out-of-memory kill.
- A saved-photo payload for the 580 MiB collection was 29,713 bytes. A different admin's attempt to use the same photo identifiers was rejected before listing creation.
- A mixed saved-photo/new-file batch published successfully with the requested ordering and primary photo. Removing its inbox original left the listing copy readable and byte-identical.

## Deployment

Deployment completed successfully on September 21, 2026 at 10:57:39 AM America/New_York. Final verification at 14:59:02 UTC confirmed one active configuration, 100% production traffic, and preserved runtime configuration. The live image is `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:6b506b52c62ad93f86be6ed57c04e55d6e5002ea5f32743da956adbe065e3f19`.

Live HTTPS checks passed against both public addresses for the homepage, catalog, listing gallery, login, and protected admin/photo endpoints. Operational artifacts are under `.codex-work/bulk-large-batches-20260921/`.

## Rollback

Previous live image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:469616884bd09583154e457ea541438086728bb79ed056b48e770efd64f34df7`.

Restore only the application image, preserving existing runtime configuration. No database reversal is needed; this release stores ordinary independent listing-image assets.
