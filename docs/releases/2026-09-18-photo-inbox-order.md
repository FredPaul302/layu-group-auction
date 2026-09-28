# Photo inbox sorting and duplicate checks

Deployment completed successfully on September 18, 2026 at 8:33 PM America/New_York (September 19 at 00:33 UTC). The release receives 100% of production traffic, with one active configuration and all other runtime settings preserved. The release image is
`816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:3edf1accb45aaaf29488e958ed2ccce05022aa0f204b97b861ec8b2cb755778c`.

## User-visible changes

- Photo date defaults to newest first; oldest first, upload date in either direction, and natural filename sorting are also available. The browser remembers the choice.
- Each photo identifies its date source. Camera capture time is preferred; original device file time and upload time are explicit fallbacks. Camera times without an offset use the uploading device's time zone and are marked estimated.
- A most recently saved thumbnail, filename, photo date, and saved timestamp help identify where an upload session stopped.
- After native file selection, exact file fingerprints are checked before photo transfer. A review step lists new photos and skipped duplicates, followed by an explicit upload button. Renamed identical files and repeats within one selection are skipped. Edited or recompressed files may count as new.
- The server recomputes fingerprints and serializes concurrent writes per account and fingerprint. Another device's simultaneous upload cannot create a second new copy.
- Existing duplicate copies remain intact. Photo preview controls now place the Enlarge label below the full thumbnail.

## Existing photo update

Migration `20260916000200_photo_inbox_metadata` adds nullable capture date, original file date, source, fingerprint, and metadata version fields plus a seller/fingerprint index. It is compatible with the prior release.

`scripts/backfill-photo-inbox.ts --time-zone America/New_York` reads each existing private photo once and adds metadata without changing its bytes, storage key, filename, or saved timestamp. Existing duplicates are not merged or deleted. Missing offsets are marked estimated. Historical files with no camera date use upload time because their original device file dates were not previously retained. A catch-up pass after rollout covers uploads accepted by the prior version during deployment.

The pre-rollout migration and indexing task exited successfully. It indexed 270 existing photos, recovered 269 capture dates, and retained the upload-date fallback for one photo. No photo failed indexing.

After the new image received 100% of traffic, the catch-up task indexed five more photos, recovered all five capture dates, and exited successfully with no failures. Across both passes, 275 existing photo records were indexed and 274 capture dates were recovered.

## Validation

- Lint, type checking, deployment readiness, and production build passed.
- 855 tests passed; 11 database tests remain opt-in. The full suite was rerun with two workers after local resource pressure interrupted a parallel run.
- A clean Docker build passed; the final thumbnail/text refinement was rebuilt successfully. All 268 checked source/configuration files match the final image.
- Isolated PostgreSQL and final-container checks cover ten 2.3 MB originals, EXIF-to-UTC dates, renamed files, concurrent saves, owner isolation, file-date fallback, idempotent indexing, and preservation of historical duplicates and timestamps.
- Browser verification confirms remembered sort order, date labels, thumbnail layout, and an all-duplicate selection reporting no new uploads. An earlier mixed selection skipped two duplicates and saved only the new photo.
- Live HTTPS checks passed against both public addresses: homepage, catalog, listing photo gallery, login, admin redirects, private photo-inbox authentication, and the new duplicate-check route. Final hosting verification confirmed the exact image digest and successful deployment.

## Rollback

The previous live image is
`816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:17595a111b7913834702704c46d52ab563cecbb28e020e43ee8a7ced871a42bf`.
The additive database migration can remain in place if the application image is rolled back. The old app does not use duplicate checks or capture-date sorting; run the metadata catch-up again before a later rollout of this feature.
