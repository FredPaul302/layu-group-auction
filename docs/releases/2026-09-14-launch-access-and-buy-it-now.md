# Launch access and combined auction / Buy It Now listings

## Release status

Completed September 14, 2026, at **09:46:37 UTC** (5:46 AM Eastern). AWS marked the
deployment **SUCCESSFUL** with 100% of production traffic on the new image.
Rechecked the service configuration and live HTTPS pages at **12:11 UTC**.

- Public address: https://market.layu.llc. The previous auction.layu.llc redirect remains.
- ECS deployment: `Do0h0kxay663MMrVAFlMf`.
- Target service revision: `6691429480353080377`.
- Web image tag: `launch-access-20260914-0537`.
- Web image digest: `sha256:8639cb2956bbe7e6f42bb40615dfb2e877b79f376517bafa97a8098fcd4235e5`.
- Previous image: `sha256:1b9e9be9a267ecb212ab2ccd445a52bbe18a0a633e9a5b067e1e4897fe5760f4`.
- One-off migration task: `a56739c032054dc5ba2b25f0fd0efc6b`, exit code 0.
  It ran the same schema/migration from image tag `launch-access-20260914-0522`;
  the final web image additionally corrects reservation wording on the payment page.

## Buyer and seller behavior

- Browsing is public. Buying, bidding, and accepting runner-up offers require a
  confirmed email. Blocks and unresolved non-payment restrictions still apply.
- Buy It Now requires no deposit at any price, including after launch access is disabled.
- During launch, auction bids and runner-up offers up to and including $40 require
  no deposit. Higher amounts require at least $1 held in an approved account deposit.
  The boundary uses the bid/offer amount before shipping. Pending deposits and identity
  approval alone do not substitute for an approved deposit during launch.
- The two deposit tiers are $1 and $20. New $20 requests are disabled during launch;
  that tier is reserved for later. Existing historical deposit amounts are preserved.
- Listings may be auction-only, fixed-price, or Auction + Buy It Now. Combined
  listings use an auction with an optional Buy It Now price above the starting bid.
  Bulk Auction rows can supply the optional `priceCents` value.
- Buy It Now remains available until the auction ends or bidding reaches its price.
  Reserving ends bidding and creates one order, including with concurrent requests.
  An expired, rejected, or cancelled combined reservation needs manual relisting.
  Ordinary fixed-price reservations retain their existing catalog-release behavior.
- Existing orders remain payable. External payment submission and manual approval
  remain in place. All money remains integer cents and timestamps remain UTC.
- A homepage announcement explains the rules. Admin > Buyer protection accepts an
  optional YouTube or HTTPS MP4/WebM URL. No video has been supplied; the text appears
  without a video. A supplied file can later be placed in existing object storage.

## Database and compatibility

Migration `20260914000100_launch_access` adds `launch_access_enabled` (default true)
and `homepage_video_url`, and consolidates legacy category/profile `tier_10` values
into the physical `tier_5` enum value. Prisma exposes that physical value as logical
`tier_1`, retaining compatibility with the previous deployment during the rollout.
Recorded financial amounts are not rewritten. The production audit confirmed
`launchAccessEnabled: true`, saved `verificationLevel: 3`, and no video configured.
Launch access takes precedence over the saved level.

The web update changes only the container image. Runtime settings, secret references,
roles, network, capacity, health checks, and the custom-domain routing are preserved.

## Validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm deploy:check` passed.
- Normal suite: 744 passing tests; 11 opt-in database tests skipped.
- Separate isolated PostgreSQL run: all 6 launch commerce tests passed, covering
  competing buyers, a simultaneous bid and Buy It Now request, $40/$41 access,
  repeated reservation requests, expiry, and cancellation.
- Local `pnpm build` passed. Final Docker build passed, including TypeScript.
- A clean Docker build passed earlier. A second clean build encountered a full
  local disk and Docker stopped. Generated development cache was moved, not deleted,
  to `D:\CodexBuildCache\layu-market-launch-20260914\development-cache`.
  Docker and the existing local services were restored; the final build reused
  unchanged dependency layers. No source files or database volumes were deleted.
- The final image matched hashes for 248 application/schema/public/script files.
- Browser checks used an isolated local database and synthetic accounts. An
  email-confirmed buyer without a deposit bid $40, was asked for a deposit before
  bidding $41, and successfully reserved a combined listing at $75 without a deposit.
  Checkout reached the correct local payment page and bidding ended.
- Reviewed the homepage announcement, combined-format listing editor option, and
  launch/video controls in the browser. No synthetic orders were placed in production.
- Live HTTPS checks passed against both public load-balancer addresses with normal
  certificate validation: homepage announcement, verification help, catalog, Buy It
  Now browsing, login, and registration returned 200. Admin access redirected to the
  correct market.layu.llc sign-in page. The old hostname returned 301 and preserved
  the tested listing path and query. The announcement was also verified in the live
  browser. The deployed image matched the intended digest and all non-image runtime
  settings matched the recorded baseline.
- Removed only the temporary preview container and isolated synthetic preview
  database after testing. Existing local database volumes and services were retained.

## Remaining launch dependency

AWS SES reported `ProductionAccessEnabled: false`, `SendingEnabled: true` in
`us-east-1`. Confirmation emails to arbitrary new buyers remain restricted by the
SES sandbox. A production-access request was prepared and presented for permission;
it has not been submitted without the user's approval. AWS approval is separate from
the website release. No confirmation emails or support messages were sent in testing.

See [the admin guide](../market-admin-guide.md) for listing and video instructions.
