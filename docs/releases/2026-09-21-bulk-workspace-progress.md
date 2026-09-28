# Bulk workspace progress — September 21, 2026

Bulk listing work previously lived only in the open browser tab until every required field was ready for listing creation. This release saves unfinished batches privately to the admin account, including 100 incomplete rows, assigned and unassigned media, photo order and covers, AI previews and revision instructions, price/condition fields, and the shared UTC auction ending.

The editor adds a batch name, automatic saves after a short pause, **Save progress**, **Saved batches → Resume batch**, and deletion of inactive saved workspaces. An IndexedDB recovery copy also retains unfinished text and newly selected File bytes in the same browser. Each File is written once rather than rewritten with every description edit. The UI warns on unsaved departure and distinguishes account-save completion from pending work. Browser recovery is subject to browser storage availability and does not replace the account save.

Media assignments now offer **+ New item** in the **Add to** dropdown, with **Create new item** and **Add to previous item** buttons beside each assignment badge. Creating an item assigns the current photo or video immediately; the previous-item action uses the preceding file's item. Creation stops at 100 rows, and previous-item assignment is disabled without a preceding assignment, when already assigned there, or when its video allowance is full. New rows and assignments participate in the same saved batch and shared closing time.

Saved inbox originals remain metadata references, preserving the 1 GB workspace and 100-row limits. New photos and videos are saved one at a time as private workspace assets before account-save completion; selected files survive device changes after that confirmation. Snapshot writes enforce ownership, bounded JSON, stored media sizes, and optimistic versions. Referenced inbox photos are protected by foreign keys until removed from the saved workspace or copied into completed listings. Listing creation locks and completes the workspace in the same transaction as the listings, and a retry returns the existing IDs. Completed workspaces cannot be edited back into unsubmitted batches. Deleting a workspace leaves listings and inbox originals intact.

## Validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=2`, `pnpm deploy:check`, `pnpm build`, and the required clean Docker build passed.
- 893 tests passed; 11 existing opt-in tests skipped. New tests cover incomplete snapshots, File metadata, interrupted AI previews, ownership, version conflicts, completed workspace rules, photo protection, and route guards/body limits.
- A private preview with PostgreSQL and a 1 GB app container saved and restored 100 unfinished rows, 100 assigned photos, one video, AI previews/instructions, and a shared ending. The browser changed row 50, autosaved, reloaded and restored it correctly.
- All 100 rows then created draft listings atomically. Retrying returned the same IDs. Deleting the completed workspace left all 100 listings and inbox originals intact; copied video bytes remained available.
- A separate browser test selected a local JPEG, saved it with required listing fields still empty, resumed it from the account after reload, enlarged its image, completed the fields, and published. Stored original bytes matched the uploaded file exactly.
- The local database matched the Prisma schema after migration. The final image matched all 278 checked source/config/schema files.

- A final two-device browser test verified that a stale save cannot trap the user: both the local recovery and newer account copy remain accessible. The local recovery restored the raw JPEG File from IndexedDB, rendered its full image, and retained unsaved text. The newer account version was then reopened, manually merged, and saved normally.
- The final image's browser test verified the **Create new item** button, the dropdown's **+ New item** option, and **Add to previous item** for photo/video assignments. Moving files cleared their old rows and preserved the photo cover. The six-row batch reopened with both files assigned correctly; at 100 rows, both creation controls were disabled. A screenshot confirmed both buttons beside the assigned badge and **Add to** above each dropdown.
- Eighteen public HTTPS checks passed across both live addresses at 16:13:41 UTC: homepage launch copy, current tier labels, catalog title/gallery links, original-photo viewer, admin/login redirects, and authentication protection for photo inbox and private saved-workspace assets. TLS certificate validation remained enabled.

## Deployment

Final image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:6990307f18d2dc3dc053b2f8e4bec1be6a10889d8965e7f286f59df53babd6ba`

The final deployment completed successfully at 16:17:11 UTC and was verified at 16:18:31 UTC with one active configuration, 100% production traffic, the expected image, and the unchanged runtime configuration. Service revision: `0595671309988287270`.

Migration: `20260921000100_bulk_workspace_drafts` adds the workspace, attachment, and protected inbox-photo reference tables. It does not rewrite existing listings, deposits, bids, or inbox assets. An isolated maintenance task applies the migration and checks all three tables before the app deployment. Runtime configuration is preserved during image replacement.

Previous image / rollback: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:6b506b52c62ad93f86be6ed57c04e55d6e5002ea5f32743da956adbe065e3f19`. The additive tables can remain in place if rolling back the application.

The first deployment completed successfully with image `1761322f9181c47a8e058b8064b6525116200be46f13d3112ce789acf9ca3678`. The recovery adjustment in image `6694315bfb2c1c82da448b3a025b5216b5a2ef0959be875dd47140e51cc0a7c1` completed at 15:57:29 UTC and was verified serving 100% of traffic with unchanged runtime configuration. The final image adds the assignment shortcuts; no additional database migration is required.

Release evidence: `.codex-work/bulk-progress-20260921/`, `.codex-work/bulk-progress-20260921-v2/`, and final rollout `.codex-work/bulk-progress-20260921-v3/`. Deployment verification is recorded in `live-verification.json` and public HTTPS checks in `http-verification.json` when rollout completes. Local test containers `layu-bulk-progress-preview`, `layu-bulk-progress-fix-preview`, `layu-bulk-new-item-preview`, and `layu-bulk-assignment-buttons-preview` are stopped after testing; unrelated Docker services are untouched.
