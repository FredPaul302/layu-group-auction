# Set up listing destinations

Reviewed September 23, 2026. Preparing an item, exporting a file, and sending an item to a connected account are separate operations. Preparation alone never means an external item is posted.

## Start with the accounts you already have

1. Open the admin cross-listing area and select a small fixed-price pilot batch.
2. Choose destinations and review their separate title, description, condition, price, and ordered photos. Destination edits should leave the website listing unchanged.
3. For manual destinations, copy the item details, open the destination, upload the photos, and review the destination's category, shipping, and fees. After publication, save the listing URL and mark it posted in Layu.
4. For connected destinations, review the proposed action and the returned result. A Shopify draft is still a draft. A Facebook business Page post is a promotional post, not a Marketplace listing.
5. When an item sells, promptly remove other purchasable copies. The initial workflow has no automatic inventory/sale synchronization for manual destinations. Reserve separate physical stock for initial pilots whenever practical.

Keep secrets in the server's secure configuration. Do not paste account passwords, app secrets, browser cookies, or access tokens into listing descriptions or support messages. Account connections and API permissions are distinct from customer Google/Facebook sign-in.

## Facebook personal Marketplace

Use a personal profile that already has Marketplace selling access. The preparation package provides text and photo references; complete publication in Marketplace and record its URL here. No browser bot or personal-profile posting API is used.

Meta's Seller app announcement describes bulk publishing and synchronization through that app. It does not document general custom-site Marketplace API access. If the app is available to the account, evaluate its actual import options during the walkthrough; a Layu JSON file is not advertised as a Seller importer. [Meta Seller announcement](https://about.fb.com/news/2026/07/introducing-seller-app-facebook-marketplace/).

## Facebook business Page

Choose the Page owned by the business and confirm who can create content. Page promotions link back to the Layu item. Auction packages include the starting bid and a readable closing date in Eastern time, including EST or EDT; stored timestamps remain UTC. Review those before posting. Only published, still-live auctions can be promoted through this workflow.

A direct connection needs a Meta app, a Page access token, permissions to publish to that Page, and any account/app review required by Meta. Verify current requirements in the app dashboard and [Meta's Pages API documentation](https://developers.facebook.com/docs/pages-api/posts/). The documentation returned a rate-limit response during this review; permissions and eligibility must be verified during the account walkthrough before enabling live publication. Never substitute a personal login password for a Page token.

## Facebook Shop / Instagram catalog

First confirm the business portfolio, Page, domain, supported country, and account approval. Shopify's documented Meta channel requires a business Page/portfolio under the seller's control and products purchasable on the verified website. Product review remains Meta's decision. These requirements do not establish approval for Layu's reservation and manual-payment checkout. [Meta channel requirements](https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/requirements-and-considerations).

Select an approved catalog connection only after that review. Prepared text/photos are useful groundwork; generic Layu JSON is not a Meta catalog feed. Do not subscribe to Shopify merely to bypass an unresolved Shop eligibility question.

## eBay

Use prepared content for manual listings now. The next supported direct connector is the eBay Inventory API: authorize the seller, map categories and category-specific condition/item specifics, create inventory/location records, and associate payment, shipping, and return policies. A draft offer is not a published listing; publication is a separate step and all required fields must be present. Review charges and stock handling before that step. [Required offer fields](https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html), [listing management](https://developer.ebay.com/develop/guides/sell/listing-management).

eBay item titles require an 80-character maximum. Layu reports overlong titles for editing rather than silently losing text. [eBay title definition](https://developer.ebay.com/devzone/xml/docs/reference/ebay/ReviseItem.html).

For an automatic pilot, create developer sandbox credentials and a sandbox seller, test failed submissions and duplicate retries, then authorize the production seller separately. Choose the marketplace, location, business policies, and test items during the walkthrough. No eBay-ready CSV is claimed because required category fields are not yet collected.

## Craigslist

Choose the local area and appropriate seller category in Craigslist, then use the prepared copy and photos. The official bulk interface is approval-based for high-volume accounts in eligible paid US categories, including For Sale By Dealer. Craigslist offers a validation endpoint before posting. Ask Craigslist about access if monthly volume is suitable; do not send automated posts before approval. [Craigslist bulk interface](https://www.craigslist.org/about/bulk_posting_interface).

If approved, the next connector must gather local area/category/location, authorized account details, and any posting charge, then interpret validation and posting responses per item. The current generic preparation files are not Craigslist RSS submissions.

## Mercari

Prepare the item, then choose its category, condition, and delivery settings and publish in Mercari. Save the final listing URL. A general seller publication API has not been verified, and Mercari restricts automated access through interfaces it does not provide. Keep publication manual unless Mercari confirms a supported account integration. [Mercari prohibited conduct](https://www.mercari.com/us/help_center/topics/account/policies/prohibited-conduct/).

## Shopify drafts

Use an existing store if available. The Shopify-specific CSV uses documented product columns, stable Layu handles, dollar prices, ordered images, draft status, and no online-store publication. New inventory starts at zero and overselling is disabled. The export is for a USD store; it does not convert currency. Public HTTPS image URLs are required. Import without overwriting matching products for the first pilot, and inspect Shopify's preview before accepting it. Multi-location stock requires a separate inventory workflow. [Shopify product CSV documentation](https://help.shopify.com/en/manual/products/import-export/using-csv).

A connected GraphQL draft workflow requires an authorized app installed on that specific store. Product creation and storefront publication are separate. Review the connector's setup document for its exact configured scopes; use only the necessary product/inventory permissions. [Shopify productCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate).

Before making drafts sellable, choose which physical units belong to Shopify and review category, shipping, tax, and checkout settings. Do not assume importing a Layu draft reserves stock or imports orders. A future sale-sync connector needs authenticated, deduplicated webhooks and reconciliation because deliveries may be duplicated or arrive out of order. [Shopify webhook delivery](https://shopify.dev/docs/apps/build/webhooks).

## Auction and stock rules

Layu auction items, including auctions with Buy It Now, cannot be copied as independently purchasable marketplace items in this release. Promote them through Facebook Page links. Draft, closed, reserved, paid, and archived items must not be promoted as live auctions. External destinations retain their own selling rules; a shared Layu closing time does not turn other marketplaces into the same auction.

Keep stable local listing IDs, SKUs, external IDs, and external URLs. A retry after an uncertain response must first reconcile whether the destination accepted the original request. Do not create another live item merely because a response timed out. Changes to a website listing require review of previously prepared or posted destination versions. These are application safeguards; they do not promise atomic inventory across separate websites.
