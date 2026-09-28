# Social sign-in and bulk cross-listing

The subsequent [September 24 Google login layout update](2026-09-24-google-login-layout.md) is deployed. It moves Google below email/password and uses the official logo button, preserving the Google connection settings documented here.

Status: **deployed and verified live on September 23, 2026**. AWS rollout started at 17:00:33 UTC, finished successfully at **17:09:40 UTC**, and final image/configuration verification passed at 17:10:22 UTC with 100% production traffic and one active configuration. **Google sign-in was enabled and its live configuration/public HTTP checks verified on September 24 UTC**; the real owner consent/link/sign-in pilot remains pending confirmation. Meta applications and selling accounts are not connected. No external posts, products, purchases, or subscriptions were created.

## Included

- Optional Google and Facebook registration, login, explicit linking, and disconnection. New users remain bidders; email verification, terms, and account restrictions remain enforced. Existing emails never auto-link. Google uses signed identity verification, PKCE and nonce; both flows use one-use state and a separate browser-binding cookie. No long-lived provider sign-in tokens are stored.
- Public data-deletion instructions and privacy disclosure. The instructions use the site's configured support email; confirm that it is monitored before submitting a Meta application.
- **Admin → Connections** with provider setup addresses and safe configuration status.
- **Admin → List elsewhere**, linked from listing/bulk batch selections. Prepare up to 100 items for Facebook Marketplace, Facebook Page, Facebook Shop/catalog, eBay, Craigslist, Mercari, and Shopify. Database-backed destination records survive leaving the page; repeated preparation preserves edits and publication tracking.
- Separate destination title, description, condition and dollar price; text/JSON exports, ordered per-item photo ZIPs, and Shopify draft CSV with zero stock. Auctions may be promoted on the Page and cannot become independently purchasable copies.
- Server-configured Facebook Page promotion posting and Shopify draft creation. Exact reviewed records require confirmation in the admin UI. Shopify remains unpublished, stock is zero, and collision/recovery guards prevent silently overwriting unrelated products. Timeouts and uncertain result saves require review before another attempt.
- Manual external URL tracking and dashboard removal reminders when the Layu item sells, closes, is unpublished, or is removed. External sales, stock synchronization, and automatic remote removal are not implemented. Recording a removal does not mutate orders/payments or delete a remote post.

eBay remains guided copy/download/manual publication. Official eBay documentation confirms that Inventory API offers need API-based editing; incomplete native offers cannot simply be handed to Seller Hub for completion. A full eBay connection needs account-specific category/condition, policies, location, fee review and inventory/order handling. Facebook Shop approval and approved Craigslist/Mercari access also remain separate account-specific work.

## Validation

- `pnpm lint`: passed. An earlier concurrent build/lint attempt exhausted local memory; the sequential rerun passed.
- `pnpm typecheck`: passed.
- `pnpm test --maxWorkers=1`: **1,121 passed**, including opt-in isolated local PostgreSQL tests; no skipped tests in the final run.
- `pnpm deploy:check`: passed for the local configuration. New tests ensure explicitly enabled incomplete social providers fail deployment readiness; no secret values are reported.
- Production Next.js build: passed in an isolated D: workspace, with synthetic build settings and no copied local secrets or uploaded customer files.
- Clean Docker build: passed with `--no-cache`. Docker's external network remained stalled after its earlier crash; a temporary allowlisted download relay supplied npm, Prisma and Google Fonts over verified TLS without restarting Docker, WSL, ERPNext or PostgreSQL. The relay was removed after the build. The repository Dockerfile was unchanged; only a temporary build argument enabled Node's proxy support.
- Exact Docker image/source verification matched **308 files**. Seven HTTP workflow groups passed inside that image against synthetic fixtures in the isolated local database, covering preparation, repeat safety, exact dollars, conflict detection, actual photo ZIPs, Shopify draft CSV, role/owner/origin protection, removal tasks and disabled social providers. The verification container was removed. The Docker client timed out after successfully starting the container; independent inspection, its immutable image identity, completed HTTP checks and saved receipt confirmed the test result.
- Additive migration applied successfully to the existing isolated preview database. HTTP checks verified seven-channel preparation, auction restrictions, repeat safety, exact dollar overrides, optimistic versions, CSV draft/zero stock, actual ordered ZIP downloads, owner/admin/origin controls, sale-removal reminders, and disabled-provider handling.
- Browser checks covered admin navigation, preparing a batch, destination-only edits, dollar display, saved preview content, setup status, persistent success messages, and keeping the item editor open after saving.
- Production HTTP checks: **28 passed** across both public IPv4 addresses at 17:08 UTC. Home/catalog/auth/privacy/deletion pages returned 200; admin/account/download routes required login; Google/Facebook callbacks stayed disabled; unknown providers returned 404. All requests verified HTTPS certificates with the real hostname. The host's system DNS lookup failed, so the checker resolved fresh addresses using public DNS without changing any DNS settings.
- Provider tests use mocked responses and cryptographically signed Google test tokens. Real provider login and destination pilot tests require account configuration.

## Deployment

Migration `20260923000100_social_login_and_cross_listing` adds `social_accounts`, `social_login_attempts` and `cross_listings`; it does not change existing users, prices, deposits, bids, orders or payments. Cross-listing records retain their snapshots when a local listing is deleted. The migration and deployment-readiness check passed in a one-time AWS task before rollout. Its read-only follow-up confirmed all three tables, the completed migration, working Prisma models, inactive providers and a configured support email. The task exited successfully and stopped.

Release tag: `social-cross-listing-20260923-01`.

- Tested local image: `sha256:683586fc32af5a03000d732cb605cad24a2e727d89c00e4faa7155db7aa8e949`.
- Verified registry configuration: `sha256:e568d52d67a18ae358b328410833fda177671d1634c662c9903eb5fc034d3211`.
- Deployment image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:a6eb7f1d762f4aefb9ec88735cf09df5ec39ebe5b8b3eb266c0cbcf4f6082c4a`.
- Previous image retained for rollback: `sha256:f811ecc1e395d4d4fa0c6f3c055380f81bc7c5c977d674ed1d97d49834aec958`.
- Service: existing `default/layu-auction-web-beta`. Only its primary container image was updated; a captured configuration fingerprint guards the existing roles, environment, resources, network and scaling settings.
- September 23 release revision: `9303659659311746059`. Its runtime configuration fingerprint matched the pre-release baseline; the migration task stopped and the old application revision drained. The later Google configuration revision is recorded below.

The user freed disk space before this release. No Docker-wide cleanup, restart, disk relocation or ERPNext interruption was performed. Release receipts are in `D:/CodexTaskTemp/LayuMarket/social-cross-listing-release-20260923/`; the scoped helper is `.codex-work/social-cross-listing-20260923/release.mjs`. Registry credentials and AWS request files are temporary, privately permissioned, and removed after use.

Build/preview artifacts are in `D:/CodexTaskTemp/LayuMarket/social-cross-listing-20260923/`. The isolated HTTP verification script is `.codex-work/social-cross-listing-20260923/verify.mjs`; its safe receipt is `verification-receipt.json` in that D: folder. The local preview uses port 3012 and the existing isolated `layu_tiers_currency_20260921` database, not production.

The synthetic local preview on port 3012 and its owned launcher processes were stopped after live HTTP verification; the port is released. The live Connections page was queued in Codex for the owner. Do not use localhost callback addresses when creating production provider applications; use the `https://market.layu.llc` addresses in the setup guide. ERPNext and the local PostgreSQL container were left running.

Follow [social sign-in setup](../social-sign-in-setup.md), [marketplace setup](../cross-listing-setup.md), and [direct connections](../cross-listing-direct-connections.md) to connect accounts one at a time after deployment. Secrets belong only in protected server configuration; never paste them into chat or put them in browser code.

## Google configuration follow-up

The owner's Google Web OAuth credentials were privately validated for project `layu-market` and the production callback. Google branding URLs, authorized domain and the three basic sign-in scopes are saved; the owner is also listed as a test user. The Google application remains in **Testing**. Google's [documented basic-sign-in exception](https://support.google.com/cloud/answer/15549945?hl=en) applies to requests limited to `openid`, email and profile: users need not be listed as test users, and the usual Testing warning and seven-day authorization expiry do not apply to those requests. Account or organization restrictions can still apply. The owner is performing the real connection pilot; its result is not yet confirmed.

AWS activation is tracked separately in `.codex-work/google-login-20260924/`. On September 24 UTC, the owner-approved narrow `LayuGoogleLoginSetup` policy for the deployment identity and `LayuGoogleLoginSecretRead` policy for the existing execution role were created through the AWS console. Both target only `/layu-auction-web-beta/GOOGLE_CLIENT_SECRET`; the setup policy explicitly prevents overwriting it. The helper then stored the Google secret as a Standard SSM SecureString, version **1**. Existing policies, credentials and the application image were preserved.

The one-off runtime preflight completed with exit code **0** and stopped at **2026-09-24 03:35:12 UTC**, with the result verified at 03:35:52 UTC. It used the same immutable image and existing settings plus the Google configuration, passed deployment readiness, and verified secret injection against its expected hash without printing values. It requested no Google tokens and made no database changes. Express networking was matched to the running task's observed network interface; no existing network settings were changed.

The Google-only configuration rollout finished **SUCCESSFUL at 2026-09-24 03:45:23.446 UTC**, on service revision `5067518612696407687`, with 100% production traffic and zero reported deployment failures. Final configuration verification passed at **03:47:24.635 UTC**, confirming the same immutable image and preservation of all unrelated settings. All **14 public HTTP checks passed at 03:47:33.690 UTC** across both freshly resolved public IPv4 addresses using system DNS and verified TLS. Google buttons are visible alongside password forms, Facebook remains hidden/disabled, and missing-state callback requests are rejected safely.

Google is enabled on the live website; the **real consent, account-linking and subsequent sign-in pilot remains pending confirmation**. The Google consent application remains in Testing with the basic-sign-in exception noted above. Facebook and selling-channel connections are outside this activation. Safe verification receipts are in `.codex-work/google-login-20260924/receipts/`; no credentials are included in them.
