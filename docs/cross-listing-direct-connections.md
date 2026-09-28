# Connecting a Facebook Page and Shopify

Prepared listings can be sent to a connected Facebook business Page as posts that link to Layu, or to Shopify as unpublished product drafts. Personal Facebook Marketplace, Facebook Shop, eBay, Craigslist, and Mercari use the prepared listing workflow until their separate account requirements and supported publishing connections are implemented. A configured connection does not prove that its credentials or permissions are valid; the destination checks those when a request is made.

No accounts, subscriptions, or paid listings are created by adding these settings. Keep access tokens in the hosting service's secret configuration, never in client-visible `NEXT_PUBLIC_` settings, source control, screenshots, or chat. The connection status UI contains no token values.

## Facebook business Page

1. Use the Meta developer account associated with the business and select the Page you control. Facebook sign-in and Page publishing are separate capabilities.
2. Confirm that the app and your Page access can publish Page posts. Review Meta's [Page posts documentation](https://developers.facebook.com/docs/pages-api/posts/) and [Page feed reference](https://developers.facebook.com/docs/graph-api/reference/page/feed/). Obtain an appropriate Page access token with the required permissions and confirm any app review or access requirements in the app dashboard.
3. Add `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, and `FACEBOOK_GRAPH_API_VERSION` to the server's secure configuration. The version must be a supported version selected in the Meta dashboard, in `vNN.0` format. The app deliberately requires an explicit version rather than silently choosing one.
4. Review one prepared Page promotion and send that pilot before selecting a larger batch. It includes the listing title, description, and Layu link. Auction promotions include the closing date prepared by the listing package.
5. Open the returned Facebook post to check its appearance. This creates a Page promotion, not a personal Marketplace listing or a Shop product.

The Page token goes only to `graph.facebook.com` in the authorization header. The connector does not collect Facebook passwords or browser cookies. Its API request is immediate; this workflow does not schedule future posts. Meta's official Page references returned HTTP 429 during the September 23, 2026 implementation review, so permissions and the chosen API version must be confirmed during account setup before a live pilot.

If a request times out or returns an incomplete result, check the Page's recent posts before trying again. There is no claim of provider-side idempotency for Page posts. The application must lock and record the attempt before sending, and require manual review after uncertain results.

## Shopify drafts

1. Use an existing Shopify store if you have one. A new Shopify subscription is not necessary for preparing listings or using the other destinations.
2. Configure and install an app for that store using Shopify's supported [Admin API authentication](https://shopify.dev/docs/api/admin-graphql/latest#authentication) process. It needs product read/write access and the inventory access needed for SKU and tracking fields. Confirm access with one draft pilot.
3. Securely configure `SHOPIFY_SHOP_DOMAIN` with the canonical hostname, such as `your-store.myshopify.com`, and `SHOPIFY_ADMIN_ACCESS_TOKEN`. Do not include a URL scheme, path, custom storefront domain, or port. API calls are pinned to version `2026-07`.
4. Prepare a fixed-price listing, review it, and send it as a Shopify draft. The store must use USD. Active auctions, including auctions with Buy It Now, cannot be copied as independently purchasable products.
5. Open the draft in Shopify to review the title, description, photos, SKU, condition wording, and price. Media may still be processing in Shopify. No inventory is allocated, no sales channel is published, and no paid product promotion is purchased.

The implementation uses Shopify's [productCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate) and [productVariantsBulkUpdate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkUpdate). It explicitly creates `DRAFT`, sets the exact dollar price and SKU, enables inventory tracking, denies out-of-stock sales, and confirms zero stock. It does not call a publication or stock-increase mutation. Shopify product publishing is a separate operation.

A stable listing handle and ownership tag are shared by CSV imports and direct exports. Before creating, the connector uses [productByIdentifier](https://shopify.dev/docs/api/admin-graphql/latest/queries/productByIdentifier) to look for that handle. A matching complete, owned, zero-stock API draft with the same prepared content can be recognized without another write. An imported CSV draft is detected and requires review rather than creating a duplicate. Existing foreign products, active products, changed content, or incomplete drafts require review and are never overwritten. A failure after creating the product also requires review rather than another creation attempt.

Do not manually publish these drafts with stock until the inventory allocation and sale reconciliation process for the destination is agreed and implemented. This release does not synchronize Shopify orders, remove other copies after a sale, or guarantee inventory consistency across stores. Independent marketplace checkouts cannot be made atomic with Layu's reservations by a product export alone.

## Why eBay currently uses guided posting

Research checked September 23, 2026: eBay's [official Inventory API schema](https://developer.ebay.com/api-docs/master/sell/inventory/openapi/3/sell_inventory_v1_oas3.json) permits incomplete staging: an initial inventory item needs its SKU, and an initial offer needs SKU, marketplace, and listing format. Creating that offer does not publish it. Category, condition, inventory location, and business policies can be completed before publication.

However, eBay's [Inventory API overview](https://www.developer.ebay.com/api-docs/sell/inventory/static/overview.html) says Inventory API listings cannot be edited in Seller Hub or another listing platform; revisions must use the Inventory API. An API-created offer is therefore not a dependable substitute for a Seller Hub draft that the owner can finish there. This release prepares item details and photos for the owner to post through eBay's own listing form. It does not create incomplete API offers or claim an automatic eBay connection.

A complete direct connection needs seller authorization and business-policy enrollment, plus controls here to select the actual eBay category, supported condition and required item specifics, location, fulfillment/payment/return policies, and final fee review. Those values must come from the seller account and eBay metadata, not guesses from Layu's free-text condition note. The [publication requirements](https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html) identify these fields. Sandbox testing, inventory allocation, order reconciliation, and reliable recovery must accompany that workflow before enabling live publication.

## Operational checks

Use one item per destination for the first live account test. Verify account identity and destination, correct photos and dollar amounts, returned external links, and recovery behavior before a larger batch. Connection secrets can expire or be revoked. The UI reports a safe connection or review message; upstream error bodies and token values are not logged or returned. Requests use fixed/validated provider hosts, reject redirects, and time out after 30 seconds. Tests use mocked providers and never publish externally.
