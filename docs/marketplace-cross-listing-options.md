# Listing on other marketplaces

Original feasibility review September 21, 2026. Implementation update September 23: **Admin → List elsewhere** now saves destination-specific preparations and posting records for the seven named channels. Configurable connectors support Facebook Page promotions and unpublished Shopify drafts; remaining channels use guided copy/download and manual publication. No accounts have been connected, external listings posted, or subscriptions purchased. See [setup instructions](cross-listing-setup.md), [direct connections](cross-listing-direct-connections.md), and the release note for validation and deployment status.

The intended workflow is to enter an item's photos, condition, title, description, and price once in Layu Market, then select destinations for that item or an entire batch. Each destination needs its own publication status and listing URL; a local listing being published must never imply that an external listing succeeded.

## Platform findings

| Destination | Verified capability | Practical route |
| --- | --- | --- |
| Facebook Marketplace | Meta's Seller app offers bulk listing and synchronizes its own listings with Marketplace. The announcement does not document an API for a custom website to create ordinary Marketplace listings. A general integration for this seller's account has not been verified. | The seller plans to use personal Marketplace alongside a business Page/Shop. Start with prepared text/photos and a manual review-and-publish step unless supported direct access is confirmed. |
| Facebook Shop / Instagram | Shopify's Meta channel synchronizes a catalog for Facebook Shop, Instagram Shopping, and ads, subject to eligibility. This does not establish support for publishing ordinary Marketplace listings. | A catalog connection is an alternative business channel, contingent on eligibility and the desired storefront; do not label it Marketplace publishing. |
| eBay | The Trading API's AddItem creates listings; VerifyAddItem validates definitions before publication. Auctions and fixed-price listings have platform-specific rules. | A supported automatic connector is feasible after seller authorization, category/condition mapping, shipping/return settings, and fee review. Test in the sandbox first. |
| Craigslist | Its official bulk interface is granted case by case to high-volume posters, generally hundreds of posts monthly, in eligible paid US categories including For Sale By Dealer. | Seek approved dealer access if appropriate; otherwise prepare content for manual posting. |
| Mercari US | No general public seller publication API was verified in this research. Its policy restricts automated access through interfaces it does not provide. | Use prepared content/manual publication unless Mercari confirms an approved integration route for the account. |
| Shopify | The GraphQL Admin API supports product creation, with publication handled separately. | A supported automatic connector is feasible for a connected store. Confirm whether another store and subscription are wanted before adding it. |

Sources: [Meta Seller announcement](https://about.fb.com/news/2026/07/introducing-seller-app-facebook-marketplace/), [Shopify Meta channel requirements](https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/requirements-and-considerations), [eBay AddItem](https://developer.ebay.com/devzone/xml/docs/reference/ebay/additem.html), [Craigslist bulk interface](https://www.craigslist.org/about/bulk_posting_interface), [Mercari prohibited conduct](https://www.mercari.com/us/help_center/topics/account/policies/prohibited-conduct/), [Shopify productCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate).

Meta also distributes some partner inventory, including eBay listings, on Marketplace. This is potential additional exposure, not a promise that every eBay item will appear there or be managed as a personal Marketplace listing. The documented European partner program is for eligible classified-ad platforms and is not evidence of access for this US single-seller site. [Meta partner inventory overview](https://about.fb.com/news/2025/11/facebook-marketplace-gets-a-glow-up/), [European partner program](https://about.fb.com/news/2024/11/our-response-to-the-european-commissions-decision-on-facebook-marketplace/).

## Facebook-first proposal

The seller selected both personal Marketplace and a business Page/Shop on September 21, 2026. Account creation and Shop approval have not been confirmed. Treat these as separate destinations with shared item content, not as one publishing connection.

### Selected setup

1. Use the seller's main personal Facebook profile for the Marketplace pilot. Confirm that Marketplace selling is available on that account before connecting any workflow.
2. Create a **Layu Market** business Page with the existing logo, business details, and `https://market.layu.llc` as the website. Use this Page for auction announcements linking to Layu, including the shared closing date and time.
3. Set up the business portfolio and investigate a Shop/catalog in Meta's commerce tools. Check the actual account's eligibility, domain verification, available connection methods, and review outcome before promising catalog publication. Shopify's documented integration is evidence of one supported route, not a requirement to buy Shopify or proof that this custom site is already eligible.
4. Check the website checkout against the Shop requirements. Shopify's current Meta requirements describe direct purchase from a verified domain; Layu uses item reservations and manual external payments. Compatibility has not been established. Do not add card processing or change the payment model implicitly.
5. Begin with a few eligible fixed-price items for Marketplace/Shop. Promote website auctions through Page posts. Keep active auction stock out of independently purchasable external copies during this pilot.

Once created, record the Page URL and the business/catalog identifiers needed by the selected supported connection. Authorize connections through the platform's own account flow. Keep the existing AWS-hosted site as the inventory source; an additional Shopify subscription is not part of this setup decision.

Sources: [Facebook selling surfaces](https://www.facebook.com/help/550954179351183/), [Meta Seller capabilities](https://about.fb.com/news/2026/07/introducing-seller-app-facebook-marketplace/), [Shopify's documented Meta requirements](https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/requirements-and-considerations). Meta's linked business setup/eligibility pages were not readable without login during this review, so account-specific eligibility remains to be checked in the seller's account.

### Proposed website workflow

1. Add an admin **List elsewhere** action for a finished listing and selected bulk rows. Keep the existing Layu publication and draft controls.
2. Prepare a destination-specific title, description, condition, price, and ordered photo download. Let the seller review/edit the external version without replacing the website description. Do not imply an unsupported destination accepts the current CSV export.
3. For Facebook without approved direct access, provide separate **Copy title**, **Copy description**, **Download photos**, and **Open Marketplace** actions. Track **Ready to post**, **Posted**, **Needs update**, and **Sold**, with a seller-entered external URL. These actions prepare a listing; they do not claim to publish it.
4. Where the seller has a supported import or partner connection, adapt to that exact current schema and account permissions. Do not collect Facebook passwords or browser session cookies, or silently post through a brittle browser bot.
5. Add eBay as the first fully automatic marketplace connector; add Shopify only if a separate store is useful. Keep Craigslist and Mercari on a manual workflow until supported access is established.

## Stock and auctions

Layu Market should remain the inventory authority unless explicitly changed. Match external listings to the physical inventory item and its allocated unit, not only a listing title. External listing identifiers must survive retries and be tracked by destination.

For fixed-price cross-listing, import sale events, reserve the local unit, and remove or mark unavailable the other listings promptly. API errors must remain visible and retryable. Manual destinations need a clear seller task to mark the item sold there. No design should promise instantaneous, atomic reservation across unrelated marketplaces.

For a one-off item already receiving auction bids, an independent external sale can conflict with bidder commitments. The initial pilot should avoid independently purchasable copies of active auction inventory. A Facebook Page announcement linking to the auction event and its shared closing time can promote the event; it is a separate workflow from a Marketplace item listing. External auction formats require their own duration, price, and bidding rules; do not assume Layu's shared ending or Buy It Now behavior transfers unchanged.

## Implementation boundary and prerequisites

The chosen Facebook surfaces are personal Marketplace and a business Page/Shop. The proposed first pilot uses fixed-price stock for item listings and Page posts for website auction promotion; the seller has not yet selected pilot items. Confirm account setup, Shop eligibility, and available publishing permissions. Obtain destination account authorization through supported account connections before enabling publication. Each connector needs field validation, explicit destinations, idempotent submissions, recoverable failure states, and stock/sale reconciliation. Existing listing photos and descriptions provide the content foundation, but the current generic CSV export is not a ready-made importer for these platforms.

Platform selling fees, subscriptions, and optional partner charges are separate from the current AWS hosting bill. Do not activate paid services during the feasibility step.
