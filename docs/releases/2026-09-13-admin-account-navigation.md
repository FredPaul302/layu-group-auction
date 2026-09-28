# Admin Account navigation — September 13, 2026

## Behavior

Account in the shared site navigation opens `/admin` for signed-in administrators. A direct visit to `/account`, including the normal destination after login, also redirects administrators to `/admin` before loading buyer verification data. Buyers retain their account dashboard and existing order/payment links remain accessible.

Admin middleware continues to reject missing or invalid signed sessions. The current database role is checked by the existing admin layout, page, action, and API guards. The middleware no longer rejects a promoted administrator solely because an older signed cookie still records the bidder role. Current bidders, demoted users, and revoked sessions remain denied by server guards.

## Release

- Website: https://auction.layu.llc
- Existing service: `default/layu-auction-web-beta`, us-east-1.
- Image tag: `layu-auction-web:account-admin-20260913-1625`.
- Image digest: `sha256:871448401819dbe2804d8e75d94a563cd237fb3f3f36193172dc262c782b13e3`.
- Previous image digest: `sha256:d196c60c7bd30776daa73ab5e88ca64cef142c306a671ab04a9b8b4cff8715d4`, task-definition revision 25.
- No database migration or environment-variable change is needed. The existing container settings, secrets, roles, capacity, and rollout protections are retained.

## Validation

- All 606 tests across 83 files passed, including admin/buyer/guest navigation, active navigation highlighting, direct account redirect, and promoted/demoted/revoked-session behavior.
- Lint, type checking, deployment configuration check, production build, and clean Docker build passed.
- Runtime source comparison with the previous image found exactly three changed files: `middleware.ts`, `src/components/site-shell.tsx`, and `src/app/(account)/account/page.tsx`.
- The image excludes local credential files, historical task-definition files, and private workspace artifacts.

## Rollout

The rollout completed successfully at 20:35:32 UTC on September 13, 2026. Task-definition revision 26 serves 100% of traffic, and its running image digest matches the release above. A comparison of both active rollout configurations confirmed that every container setting other than the image, along with roles, networking, health-check path, capacity, and scaling settings, was preserved.

The signed-in browser check could not be completed because the browser agent reached its usage limit and the primary browser tool failed to initialize. Admin/buyer navigation and the current-role guards passed automated tests. Refresh an already-open browser page once to load the new navigation.

## Rollback

If needed, redeploy the previous image through the existing service. This release adds no database changes to undo.
