# Select all saved photos for bulk listings

## Changes

- Photo inbox now has **Select all** and **Clear selection** controls above the saved-photo grid. Select all includes photos outside the visible scroll area.
- Individual checkboxes remain editable after selecting all; sorting keeps the selection and determines the order of photos added to the workspace.
- The selection shows its total size and explains the existing 256 MB batch limit when exceeded.
- Changing the selection cancels a pending inbox-removal confirmation. Refreshing the inbox also removes stale selections.

## Validation

- Lint, type checking, deployment checks, and the production build passed.
- 855 automated tests passed; 11 opt-in database tests were skipped.
- A clean Docker build passed after retrying a registry download failure. All 268 checked application/configuration files match the release image.
- Browser verification against an isolated local database covered an empty inbox, selecting all 12 saved photos, excluding one photo, restoring all selections, changing sort order, clearing selection and removal confirmation, and transferring all 12 photos to the workspace in the chosen order. The saved inbox copies remained intact.
- No database migration or production data update is required.

## Release

Image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:469616884bd09583154e457ea541438086728bb79ed056b48e770efd64f34df7`.

Deployment completed successfully on September 21, 2026 at 10:27:57 AM America/New_York. Final verification at 14:29:50 UTC confirmed one active configuration, the expected image, 100% production traffic, and preserved runtime configuration. Live HTTPS checks passed against both public addresses for the homepage, catalog, listing photo gallery, login, and protected admin/photo endpoints. Operational verification artifacts are under `.codex-work/photo-inbox-select-all-20260921/`.

## Rollback

Previous live image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:3edf1accb45aaaf29488e958ed2ccce05022aa0f204b97b861ec8b2cb755778c`. Restore only the image while preserving the service's existing runtime configuration.
