# Keep the current photo in view when assigning items

Creating a new item from a media assignment inserts its editing form above the media list. The previous release relied on browser scroll anchoring; a browser reproduction moved the creation button more than 1,300 pixels down the page.

The assignment handler now captures the clicked button or dropdown's viewport position. A layout effect compensates for its displacement after the item update and before paint, accounting for any adjustment the browser already made. The anchor is consumed once so later user scrolling is not constrained. This applies to **Create new item**, **Add to previous item**, and the **Add to** dropdown. Item-form unassignment and normal navigation retain their existing behavior.

## Verification

- Lint, typecheck, deployment checks, production build, and the required clean Docker build passed.
- All 893 tests passed; 11 existing opt-in tests skipped.
- Real-browser checks against the final image measured less than one pixel of displacement for ordinary pointer creation, keyboard creation, previous-item assignment, and dropdown creation. Three additional consecutive pointer clicks each moved the control by at most 0.21 pixels.
- Account autosave caused no later jump. The sixteen-row test batch retained all expected photo assignments in PostgreSQL.
- The final image matched all 278 checked source/config/schema files. All 20 Prisma files matched the deployed baseline exactly, so no migration or maintenance task was needed.
- Test containers `layu-bulk-scroll-before` and `layu-bulk-scroll-fixed` were stopped; the private browser test session was logged out and closed.

## Release

Image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:ea71fee0d873032b8abf9ba77093993d5fa2cfeac61b79874a4e037a5ee5bbe2`

Previous image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:6990307f18d2dc3dc053b2f8e4bec1be6a10889d8965e7f286f59df53babd6ba`

Evidence: `.codex-work/bulk-assignment-scroll-20260921/`. Live completion and HTTPS checks are recorded by the release helper when the rollout finishes.

Deployment completed successfully at 19:00:56 UTC. Verification at 19:02:28 UTC confirmed one active configuration, the expected image, 100% production traffic, and unchanged runtime settings. All eighteen public HTTPS checks across both live addresses passed at 18:57:33 UTC, including catalog/gallery behavior and protection of admin and private asset endpoints. Service revision: `0914261523833890568`.
