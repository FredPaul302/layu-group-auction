# Google login layout

Status: **deployed and verified live on September 24, 2026**. Rollout started at 04:18:02 UTC; the completed release was verified at **04:29:16 UTC**, with 100% production traffic and one active configuration.

The login screen now presents email, password and the Log in button first in one card. A divider reading “Or sign in with” appears below, followed by Google's official logo-only button. The button keeps a descriptive accessible name, tooltip, keyboard focus and a 44px target. Repeated visible Google wording and account-linking guidance have been removed from the login screen. Registration retains its required terms checkbox and uses the same approved Google artwork.

Both methods retain their original POST endpoints and return destination. This update does not change authentication logic, database schema, provider scopes or account connections.

## Validation

- Lint, TypeScript and deployment-readiness checks passed.
- Unit and integration suite: 1,110 tests passed, with 11 opt-in PostgreSQL tests skipped. The previous full release covered those database tests; this change only adjusts UI and a static asset.
- Production Next.js build passed in Docker using `--no-cache`. The build reused the exact previously tested Linux dependency image and applied only the four reviewed source/asset changes. All 310 application source files matched the workspace after compilation.
- Six local HTTP check groups passed against that immutable image: control order, separate sign-in forms and destination preservation, accessible logo-only button, required registration terms, exact official SVG delivery, and hidden unconfigured Facebook.
- Browser DOM inspection verified control order, a loaded 44px logo and keyboard navigation. Edge's screenshot capture cropped inconsistently, so no complete visual screenshot is claimed.
- The live browser also confirmed that email/password precede Google, the official logo loads, the button has no visible text, and its accessible name remains “Sign in with Google.”
- All six final public HTTP checks passed across both freshly resolved IPv4 addresses: login, registration and the Google SVG each returned 200, with hostname/SNI and HTTPS certificate verification retained. Login responses contain the new form order and accessible logo button.
- Docker's external networking and Windows port forwarding remained unavailable. Temporary relays supplied only the two Google Fonts hosts over end-to-end verified TLS and provided a read-only local page preview. The build relay and preview container were removed; Docker, WSL, PostgreSQL and ERPNext were not restarted.

## Deployment

Tested local image: `sha256:4a24bfced1b0f274f49d3d2656feed8c8251a8e11933237e2a6bdcba60d0388d`.

Deployment image: `816344830615.dkr.ecr.us-east-1.amazonaws.com/layu-auction-web@sha256:6d9af305fbf39896547cf6e0750f665e0b77abcd8eebba29a80e098ec70933c2`.

Registry tag: `auth-layout-20260924-01`. Verified image configuration: `sha256:5cb5658dfdfc00324c62a161a1a29c35cc6425e0109dddc01e96282585736b14`.

Target: the existing `default/layu-auction-web-beta` service. Only the primary container image was submitted for change. A configuration fingerprint guards the current Google settings, secret references, resources, permissions and networking. No migration is required.

Completed revision: `0183935702864574682`. The live image and full configuration fingerprint match the reviewed release; Google and all other runtime settings were preserved. The temporary upload archive and private registry authentication file were removed.

Scoped helper: `.codex-work/auth-layout-20260924/release.mjs`. Safe receipts: `D:/CodexTaskTemp/LayuMarket/auth-layout-20260924/`. Registry authentication and configuration request files are temporary, privately permissioned, and removed after use.
