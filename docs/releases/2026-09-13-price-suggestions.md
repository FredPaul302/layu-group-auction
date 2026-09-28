# Optional AI price suggestions — September 13, 2026

## Behavior

Single-item and bulk upload forms can request a rough USD price estimate with the existing title/description call. The default-selected checkbox can be turned off. The preview distinguishes a fixed asking price from an auction starting bid and includes a resale range and short explanation. Price application is separate, preserves later manual edits, and never saves or publishes. Text and price can be applied in either order. No model, provider, key, billing setting, database schema, inventory balance, or SKU behavior changes.

Requests without pricing retain the previous two-field response and 500-token cap. Pricing requests require an explicit listing type, use the same endpoint/provider, and raise the output cap to 750 tokens. Existing image limits, timeouts, rate limits, and sequential bulk processing remain. Structured price output is nullable; finite positive integer cents, maximum amounts, range ordering, and fixed-price placement within the range are validated. Invalid estimates are rejected, and insufficient evidence can produce an explicit abstention.

No current-market lookup or sold-listing search is performed. The preview states this limitation and explains that an auction can sell at its opening bid. Existing pricing/category rules still govern saves.

## Verification

- 708 application tests passed; five opt-in PostgreSQL tests skipped in the default run. No database changes in this release.
- Lint, type checking, deployment configuration validation, production build, and clean Docker build passed. The first Docker attempt encountered transient registry DNS failure; the retry completed. A file-hash comparison confirms that the image contains the final application source and excludes local secrets and release scratch files.
- Isolated headless Edge checks with synthetic photos and mocked provider responses passed: both Apply orders in the single form, correct auction/fixed-price fields, bulk text then price, and preservation of manual prices in both forms. No production account or listing was touched.
- One real Gemini request using a hypothetical table's supplied facts returned a valid title, description, range, suggested price, and explanation. No item was created or published.
- At 100% traffic, HTTPS checks returned 200 for `/terms` and both released upload-page JavaScript bundles, each containing the price controls. Local DNS/connectivity required using the freshly resolved load-balancer address with the original hostname and normal TLS certificate validation. The running revision 28 container digest matches the released image. Interactive behavior was verified in the isolated browser fixture, without a production admin session.
- Provider schemas checked against [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [Gemini generation configuration](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig).

## Rollout

Image published as `price-suggestions-20260913-2042`, digest `sha256:1b9e9be9a267ecb212ab2ccd445a52bbe18a0a633e9a5b067e1e4897fe5760f4`. Rollout `GbJoZAK-nDU75RZIHg0CK` started September 14 at 00:43:30 UTC (September 13, 8:43 PM Eastern) and completed **SUCCESSFUL at 00:52:29 UTC**, with revision **28** serving 100% of traffic. Final service counts: desired 1, running 1, pending 0, failed tasks 0; the previous server stopped. Configuration comparison passed: roles, networking, capacity, health-check path, environment, and secret references are unchanged.

Previous image: `sha256:4e662e35ce2cee18617d8707b81387adc49dada98d11c5fa51c278ccba21301e`, task-definition revision 27 on `default/layu-auction-web-beta`. No migration is required.
