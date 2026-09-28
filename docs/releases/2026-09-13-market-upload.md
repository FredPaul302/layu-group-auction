# Market upload release — September 13, 2026

## Release contents

- Photo and text description drafts through Gemini, with single-item and bulk review before applying or publishing.
- Inventory purchase-order imports, receiving, adjustments, history, listing allocations, and export.
- Admin verification settings with three levels. The production default remains Level 3 (existing ID-or-deposit rules).
- Approved Layu Market masthead and light/dark backgrounds, including six stable scene arrangements.

## Deployment target

- Website: https://auction.layu.llc
- Existing ECS Express service: `default/layu-auction-web-beta`, us-east-1.
- Release image tag: `layu-auction-web:market-ai-20260913-1129`.
- Image digest: `sha256:d196c60c7bd30776daa73ab5e88ca64cef142c306a671ab04a9b8b4cff8715d4`.
- Previous image: `layu-auction-web:beta-social-preview-08f2590` (service task definition revision 24).
- Database and object storage remain on the existing hosts. The separate Lightsail trial and DNS were not changed.

## Configuration

Gemini uses `AI_LISTING_DESCRIPTIONS_PROVIDER=gemini`, `AI_LISTING_DESCRIPTIONS_ENABLED=true`, and a server secret named `GEMINI_API_KEY`. The key is stored as the Standard SSM SecureString `/layu-auction-web-beta/GEMINI_API_KEY`, encrypted using the AWS-managed SSM key. The container receives a secret reference, not a plaintext key environment value.

The existing execution role has a scoped `LayuGeminiApiKeyRead` policy permitting `ssm:GetParameters` only for that parameter. Provider/model fallback remains disabled. The operator confirmed the Google project is on the Free tier and has a $10 spend-cap setting; this release does not change Google billing.

Preflight found the previous live email configuration used `EMAIL_DRIVER=console` and a placeholder webhook. This release connects the already verified SES domain `layu.llc` using `EMAIL_DRIVER=ses`, `AWS_SES_REGION=us-east-1`, and the existing `layu-auction-web-task-role`. Sender and reply-to remain `no-reply@layu.llc` and `support@layu.llc`.

**SES still requires production approval for general buyer email.** At release preparation, the existing us-east-1 account was in the sandbox, allowing only verified recipients. No email was sent and no approval request, identity, or DNS change was submitted during this deployment.

The saved CLI deployment identity lacks `iam:PassRole` for that application role. The web update uses the authorized AWS console; no broader CLI-user permission was added.

## Validation and database changes

- Lint, type checking, all 592 tests, deployment checks, and the production build passed.
- The required clean Docker build passed. The resulting image was checked to exclude local credentials, historical task-definition JSON, outputs, and unrelated workspace artifacts.
- Existing RDS automated backups were verified: seven-day retention and a restore point at September 13, 2026, 11:23 UTC.
- The first maintenance attempt stopped during configuration validation, before database changes, because of the existing console-email setting.
- After connecting the existing SES configuration, the production deployment check and maintenance task completed successfully.
- Applied `20260913000100_inventory_ledger` and `20260913000200_verification_policy`. Both are additive; no existing users, orders, or listings were deleted or rewritten.
- The database check confirmed the site-settings singleton, verification Level 3, a $100 Level 1 default limit, and empty new inventory/PO/allocation tables.
- A separate AWS maintenance task successfully generated a Gemini description from existing public demonstration artwork. It did not publish an item or submit customer data.

## Rollout status

The web-service rollout completed successfully on September 13, 2026, at 11:50:17 UTC, using service task definition revision 25. The service is steady with one running task, no pending tasks, and 100% of production traffic on the release image above. The existing canary rollout and rollback protections were retained.

All 12 live HTTP checks passed: homepage, catalog, login, protected admin upload/inventory/verification routes, the protected AI endpoint, and byte-for-byte verification of both artwork assets. Live browser checks confirmed light/dark switching and no horizontal overflow at a 390-pixel mobile viewport. The database migrations and real Gemini photo-description test also passed.

No authenticated admin session was available for live form testing. No inventory was imported and no listing was created or published during verification. The bulk-upload login page is ready at https://auction.layu.llc/admin/listings/bulk.

A minor desktop cosmetic issue remains: the homepage headline is left-aligned while its subtitle and buttons are centered. It does not obstruct the upload workflow. General buyer emails remain subject to the SES sandbox limitation described above.

## Rollback

Retain the previous image. If the new application needs rollback, select that image through the existing Express service and preserve the database additions and any inventory entered after release. Do not drop the new ledger tables or restore an older database as a routine application rollback.

Use the existing canary rollout, health checks, and rollback protections for future releases. Review every AI draft before applying it; it does not publish an item automatically.
