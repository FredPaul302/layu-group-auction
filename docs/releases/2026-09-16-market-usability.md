# Bulk publication, saved photo inbox, and listing galleries

## Current status

**Live and verified.** Deployment completed successfully at **2026-09-16 20:15:52 UTC**,
with final verification at 20:16:37 UTC: one active configuration, 100% production
traffic, and the expected image. Runtime configuration, secrets references, roles,
network, compute size, and scaling settings match the pre-deployment baseline.
Docker recovered after the user restarted it. Removing obsolete
local website images and unused build cache recovered sufficient internal space;
moving Docker's data disk was unnecessary. Production migration completed and
confirmed the saved-photo table and bid-history delete restriction before deployment.

Image: `market-usability-20260916-01`, digest
`sha256:67887d5db38bbdadb883219d056ee8c805ae58823c50e48e6d463b7cdec65fd0`.
Previous image: `sha256:ff1e6983232094c3c5e133ea449a569ac38773d1555c91770bf30536ed644f01`.

## Changes

- Bulk creation offers Save drafts or Publish now. Drafts can be published
  immediately as a batch after creation, or selected later from Admin → Listings.
  Up to 100 existing drafts can be published together. Invalid selections are
  rejected atomically. Auction ending dates are retained.
- Drafts and unused listings can be selected for deletion, with a confirmation.
  Any bid (including invalid/withdrawn history), order, or runner-up offer prevents
  deletion. Unused inventory is released with its audit trail. The transaction
  uses serializable isolation and retries; a database foreign-key restriction
  independently prevents deletion from cascading into bid history.
- A private Photo inbox saves uploads without listings or assignments. The same
  admin can upload from a phone and use the saved images from a computer. Listing
  creation makes a separate copy, so removing an inbox image leaves listing photos
  intact. Supported files: JPEG/PNG/WebP, 8 MB each, 128 MB per upload.
- Catalog images and titles open their listing. Photo-count links open an enlarged
  gallery. The gallery includes every photo, retains the full image, and supports
  previous/next controls, arrow keys, Escape, and opening the original file.
- Deeper blue listing titles, green prices, and red accents connect the text palette
  to the market artwork, with distinct colors for light and dark themes.

## Validation so far

- 810 unit/route tests passed; 11 existing opt-in database tests skipped. This
  includes cleanup and rejection when an auction ending passes during upload.
- Final type checking and lint passed; deployment configuration checks passed
  against the configured local environment.
- Final local `pnpm build` passed using generated build files on D:.
- Final clean Docker build succeeded after reclaiming unused local build artifacts.
  All 259 source/assets/configuration files checked inside the image matched the
  workspace. The image passed the PostgreSQL/API integration checks again.
- Real PostgreSQL/API integration checks passed for private cross-session photo
  uploads, immediate and batch publication, draft deletion, bid-history rejection,
  database FK protection, gallery markup, and inbox/listing copy independence.
- Interactive browser checks passed for the catalog photo link, gallery next/close
  controls at desktop and 390px phone widths, loading private inbox photos into
  a batch, and creating a draft followed immediately by batch publication. The
  final package brings the batch controls into view after saving and replaces
  draft labels with published labels after successful publication.

## Local build recovery

Generated `.next/dev` files were moved to
`D:\CodexBuildCache\layu-market-usability-20260916\development-cache`.
The `.next` build folder now points to
`D:\CodexBuildCache\layu-market-usability-20260916\next-build`; a dependency junction
at the same cache root lets build workers resolve the existing project dependencies.
Three obsolete local beta artwork image tags and unused Docker build cache were
removed; no source, production images in ECR, or database volumes were removed.
Docker runtime socket directories were preserved as dated backups to recover a
stale-socket startup failure. Docker is running; ERPNext and the existing database
containers remain running. Its data disk has **not** been moved.

Migration applied and audited in production: `20260916000100_saved_photos_and_bid_history`.

Both disposable preview containers and the two isolated usability preview databases
were removed after testing. Existing Docker applications and database volumes were
preserved; no production test listings were created.

At 20:13 UTC, 100% of traffic was routed to the new image. TLS-validated checks on
both serving addresses passed for the homepage, catalog, a live photo-gallery page,
login, and admin/photo-inbox authentication. A live browser check opened the Dell
monitor's four-photo gallery from its photo-count link and navigated to photo two.
The rollout subsequently reached `SUCCESSFUL`; service revision
`3563410654895772160` is the sole active revision.

See the [admin guide](../market-admin-guide.md) for the new controls.
