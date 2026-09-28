# Move the public address to market.layu.llc

## Status

Completed September 14, 2026, at **07:54:01 UTC** (3:54 AM Eastern).
`https://market.layu.llc` is serving 100% of production traffic with valid HTTPS.
AWS marked deployment `FOdv8CmC02RJTo0peq5o3` **SUCCESSFUL**, with zero failures.
Both Google and Cloudflare public DNS resolvers returned the new domain's A records.

The old `https://auction.layu.llc` address permanently redirects browser GET/HEAD
requests to the new host while preserving paths and query parameters. Old-host
POST requests still reach the application, preserving external webhook and
protected internal job delivery.

## Applied changes and verification

- Route 53 zone: `Z0938627H13ES4OFS77J`. Added `market.layu.llc` as an A alias to
  the existing load balancer with target-health evaluation disabled. Added the
  ACM DNS validation CNAME; retained all pre-existing DNS records.
- Issued and attached ACM certificate `833179dc-ac7b-4d36-bf6b-8adf49943625` for
  `market.layu.llc` in `us-east-1`, with export disabled. Existing certificates remain.
- Existing ECS forward rule now has priority 2 and accepts the original AWS
  endpoint, `auction.layu.llc`, and `market.layu.llc`.
- Added priority-1 redirect rule ending in `3acee739aa328933`: old host AND GET/HEAD,
  action `HTTP_301` to `https://market.layu.llc:443/#{path}?#{query}`. The existing
  forward action and deployment-controlled target-group weights were preserved.
- ECS deployment `FOdv8CmC02RJTo0peq5o3` started at **07:44:38 UTC**. Task-definition
  revision **29** uses the same image as revision 28. Service-revision suffix:
  `0576923829582772268`.
- Compared the new configuration with the original: only the three domain settings
  below changed. Image, other environment settings, secret references, roles,
  networking, capacity, and health-check settings match the baseline.
- Validated HTTPS with certificate checking enabled against both public
  load-balancer addresses. New-domain homepage, catalog, login, registration, and
  a site image returned 200. No published listing image was available to test.
- `/admin` and `/account` returned the expected login redirects on the new host.
  Empty login submission returned 303 to the new-host missing-fields page.
- Old-domain GET and HEAD requests returned 301 with their paths and query
  parameters intact. An old saved admin-login link opened the new login page in Edge.
- Empty old-domain Didit webhook POST returned 400 and an unauthenticated internal
  auction-closing POST returned 401, confirming direct application handling without
  redirects. No account, listing, verification decision, or job was created or changed.
- This is a runtime and DNS change with documentation updates. No application
  source, image build, or database migration changed; validation used live HTTPS
  checks and configuration comparisons.

The external Didit console and existing scheduler destinations were not changed;
their old POST endpoints remain supported. New app-generated email and hosted
verification links use the updated `APP_URL`.

## Production baseline before the switch

- Account: `816344830615`; region: `us-east-1`.
- ECS Express service: `default/layu-auction-web-beta`.
- Active task-definition revision: `default-layu-auction-web-beta:28`.
- Active image digest: `sha256:1b9e9be9a267ecb212ab2ccd445a52bbe18a0a633e9a5b067e1e4897fe5760f4`.
- Service capacity: desired 1, running 1, pending 0; rollout completed.
- Load balancer: `ecs-express-gateway-alb-0191521c`.
- Load-balancer DNS: `ecs-express-gateway-alb-0191521c-187389058.us-east-1.elb.amazonaws.com`.
- Load-balancer alias hosted-zone ID: `Z35SXDOTRQ7X7K` (this is not the `layu.llc` hosted-zone ID).
- HTTPS listener suffix: `465331efeb86d8e4/467cd81bb25e1020`.
- Existing routing rule suffix: `465331efeb86d8e4/467cd81bb25e1020/aea77956150e97f8`.
- Existing host conditions: `auction.layu.llc` and `la-11ae2b0c1e04409086a73df009906ca0.ecs.us-east-1.on.aws`.
- `layu.llc` is delegated to AWS Route 53; `market.layu.llc` returned NXDOMAIN.
- Baseline HTTPS checks: `/terms` returned 200; `/admin` returned 307 to the existing login origin.

## Runtime changes

Apply these together, preserving every other environment setting, secret reference,
role, image, health check, capacity setting, and networking setting:

| Setting | Current | New |
| --- | --- | --- |
| `APP_URL` | `https://auction.layu.llc` | `https://market.layu.llc` |
| `AUTH_COOKIE_DOMAIN` | `auction.layu.llc` | `market.layu.llc` |
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | `https://auction.layu.llc/uploads` | `https://market.layu.llc/uploads` |

The application already derives login redirects, email links, and new hosted
verification callbacks from `APP_URL`. Existing sessions are scoped to the old
host; customers should expect to sign in again on the new host.

## Cutover sequence

1. Recheck the live service and routing configuration before writing, in case a
   concurrent release has changed it.
2. In ACM in `us-east-1`, find an issued certificate covering `market.layu.llc`
   or `*.layu.llc`; otherwise request a non-exportable public certificate and
   complete DNS validation in the existing authoritative `layu.llc` zone.
3. Add the certificate to the existing HTTPS listener, retaining certificates
   serving the old address and the AWS endpoint.
4. Add `market.layu.llc` to the existing rule's host-header values, preserving
   existing hosts and the live forward action. Do not replace target-group weights
   with the baseline values recorded above.
5. Add a Route 53 A alias named `market.layu.llc` pointing to the existing load
   balancer. Keep the old DNS record. Confirm valid HTTPS at the new address.
6. Roll out only the three runtime changes above through ECS Express Mode with
   the currently active image. Wait for a successful deployment and healthy tasks.
7. Check the new home page, catalog, login/registration pages, account/admin login
   redirects, a public listing image, and HTTPS certificate validation. Confirm
   redirects use the new origin and old API/webhook endpoints remain reachable.
8. Preserve old-address compatibility for saved image URLs, existing verification
   sessions, Didit webhooks, and scheduled internal job callers. Review their
   externally configured URLs before retiring or broadly redirecting the old host.
9. Update current operator documentation and mark this record complete with
   deployment and smoke-check results. Keep older release records historical.

No source-code, container-image, or database changes are required for the domain
switch. A runtime-only release should verify that the image digest is unchanged.

## Recovery

If runtime smoke checks fail, restore the three old runtime values together using
the same image and wait for service health. Retain the old DNS, certificate, and
host routing throughout the migration so the original address remains available.
Before restoring the old `APP_URL`, place the forward rule ahead of the old-host
redirect (restore forward priority 1 and redirect priority 2). This prevents a
redirect loop between the old configured application origin and the new host.

Procedure reference: [AWS ECS Express Mode custom-domain instructions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-advanced-customization.html).
