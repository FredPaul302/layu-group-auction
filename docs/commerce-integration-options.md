# Inventory, Shopify, and return per item

Research checked against official Shopify sources on **September 13, 2026**. This is an options document; it does not activate an integration, buy a subscription, or change the payment model.

The recommended next step is to maintain inventory and acquisition costs in this market, give every item a stable SKU, and export records when needed. Revisit Shopify after actual sales show whether its operational benefits justify another monthly bill. The market already supports both auctions and fixed prices; inventory should serve both.

## Three practical paths

| Path | What it means | Cost and operational tradeoff | Best time |
| --- | --- | --- | --- |
| **Keep this market; exchange CSV files** | Receive purchases, record adjustments, see stock and cost, and export inventory from the current app. Adapt an export to a destination's current import format when needed. | No additional commerce subscription for the local inventory feature. Existing hosting, maintenance, and any separately enabled AI usage still cost money. Manual exports do not synchronize stock. | Now, while sales and website costs are being measured. |
| **Keep this storefront; use Shopify for inventory and orders** | Build a server-side integration to Shopify's GraphQL Admin API. Shopify becomes the authoritative inventory/order system; the market retains its auction and verification experience. | Adds Shopify subscription costs and integration maintenance while the custom app still needs hosting. Failed synchronization needs a visible recovery path. | When another selling channel or centralized fulfillment saves meaningful work. |
| **Move fixed-price shopping to a hosted Shopify storefront** | Use Shopify's storefront, checkout, and inventory; decide separately how auctions continue. | Shopify includes storefront hosting. Savings depend on which custom services can actually be retired; an auction app that stays online still has costs. Auction, verification, and manual-review behavior would need a deliberate migration design. | Later, if standard retail becomes the main business and replacing custom operations is worthwhile. |

Shopify supports inventory CSV import/export, but its inventory file expects destination product/variant identifiers and locations. A generic SKU export is useful groundwork, not automatically a Shopify-ready import. Shopify distinguishes on-hand, committed, unavailable, and available stock, and supports validation against the stock level at export time. [Shopify inventory CSV documentation](https://help.shopify.com/en/manual/products/inventory/setup/inventory-csv).

## Costs to compare before choosing Shopify

For the US pricing shown on the research date, **Basic is $39/month billed monthly, or $29/month billed yearly**. Its standard online card rate is **2.9% + $0.30**, with different premium/international rates. The published third-party transaction fee is **2%** where applicable. Hosting and inventory management are included; app subscriptions and optional services can add cost. Verify the applicable store country, plan, payment route, and billing term before purchasing. [Shopify pricing](https://www.shopify.com/pricing).

Shopify says manual payments have no Shopify third-party transaction fee. The external payment service can still charge its own fee. Shopify's applicable third-party fee calculation includes discounted merchandise, taxes, and shipping, and is additional to the payment provider's processing fee. Do not assume every payment method uses the same fee base or that a fee is refunded when the buyer is refunded. [Manual payments](https://help.shopify.com/en/manual/payments/manual-payments), [third-party fee calculation and exceptions](https://help.shopify.com/en/manual/your-account/manage-billing/billing-charges/types-of-charges/third-party-charges/third-party-transaction-fees).

**Planning inference:** adding Shopify only as a backend does not itself remove an AWS bill. Compare subscription + remaining hosting + apps + payment fees + maintenance time. A hosted migration saves money only when it lets the business retire enough existing services or recover enough staff time.

## Inventory foundations that preserve future choices

These are design recommendations for this market:

- Give each distinct physical item or interchangeable group a stable SKU. Do not combine units with materially different condition or cost merely because their titles match.
- Record supplier, purchase-order reference, received quantity, received date, unit acquisition cost, allocated inbound freight, and storage location. Creating a purchase order should not make unreceived goods sellable.
- Keep a history of receipts, count corrections, damage, reservations, sales, cancellations, and returns, including who recorded each change and why. A return becomes available only after inspection; an unpaid order is not revenue.
- Separate physical stock from stock available to sell. Published auctions need an allocation through closing and payment handling. Fixed-price reservations also need an allocation, released consistently when cancelled or expired.
- Retain local IDs and make any future mapping explicit: Shopify product/variant, inventory item, and location IDs. Use integer cents and UTC locally. Shopify associates inventory with items and locations, and SKUs are not guaranteed unique there. [Shopify InventoryItem reference](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem).

For a first second-channel pilot, allocate different units to each channel. Avoid listing the same one-off item for simultaneous purchase on both sites until reservation handling is proven.

## What an API integration would require later

Use the [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest) for server-side catalog, inventory, and order work. Choose the stock authority before writing synchronization code. With Shopify authoritative, the local app should submit inventory changes through that authority and reconcile its local view; two independent editable stock totals will drift.

Shopify webhooks can arrive out of order or be missed. Verify signatures, deduplicate deliveries, queue recoverable work, and periodically reconcile through the API. Webhooks alone cannot guarantee that two checkouts will not sell the last unit. [Webhook delivery behavior](https://shopify.dev/docs/apps/build/webhooks), [delivery verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

If this market instead remains the stock authority, Shopify's `inventorySetQuantities` supports comparison with the previously observed quantity to prevent stale overwrites; Shopify advises using it only on behalf of the inventory authority. For the currently documented API versions from 2026-04, the mutation requires an idempotency key. Pin a supported API version and test retries and concurrent orders. [Inventory quantity mutation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities).

Confirm the chosen app distribution method, access scopes, and customer-data permissions before assuming buyer names, email, and addresses can be synchronized. Availability differs by app type and, in some cases, plan. [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data).

## Measure return per item

Use two separate views: **estimated contribution before sale** and **actual contribution after payment and fulfillment**. A selling price minus purchase price is only a preliminary spread.

```text
Item contribution = merchandise revenue after discounts/refunds
                  + shipping charged to the buyer after refunds
                  - acquisition cost allocated to the sold item
                  - allocated inbound freight
                  - preparation and packaging costs
                  - outbound shipping expense
                  - payment/channel fees
                  - other item-specific selling costs and unrecovered losses
```

Exclude tax collected for remittance from revenue, while including any fees actually charged on that tax. Use the provider's actual fee base, including shipping or tax where applicable. Allocate order-level fees/shipping across items consistently. Do not count a refunded product's cost twice if a returned unit has been restored to inventory.

For example, using hypothetical costs and the standard card rate above: a $60 item plus $10 buyer-paid shipping, less $20 acquisition, $2 inbound freight, $1 preparation, $1 packaging, $9 postage, and $2.33 payment fee leaves **$34.67 estimated contribution**. This assumes a $70 fee base and no taxes, discounts, refunds, or other fees; actual settlement determines the final amount.

Monthly hosting and subscriptions are overhead. Keep contribution visible before overhead, then show a separate allocation for business planning. For example, a hypothetical $100 monthly overhead divided by 10 completed items is $10 per item. Missing actual fees or shipping costs should remain marked **incomplete**, not silently become zero.

Track contribution alongside days in stock, sale completion rate, and the time spent preparing each item. Higher prices help only if stock sells and the proceeds exceed the extra work and costs. Use these figures to compare auction versus fixed price and to decide when another channel pays for itself.
