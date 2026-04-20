# Auction V1

## Product Summary

V1 is a single-seller marketplace with two listing types:

- `auction`
- `fixed_price`

Auction listings start immediately when published. The UI must not expose scheduled future starts in V1. Auction listings require an end date/time. Fixed-price listings use the same verification and manual payment flow as auctions.

## Roles

- `guest`: can browse public pages but cannot bid, claim, or manage listings
- `registered_user`: has an account but may still be missing email or bidding verification
- `deposit_verified_bidder`: email-verified user approved for a manual refundable deposit tier
- `persona_verified_bidder`: email-verified user approved through Persona and allowed full bidding eligibility
- `admin`: manages listings, verification, payments, pickup events, relists, and enforcement actions

## Business Rules

- V1 is single-seller only.
- Every user must verify email.
- After email verification, the user chooses one verification path:
  - Persona ID verification
  - refundable deposit verification
- Deposit tiers are `$5`, `$10`, and `$20`.
- Deposit can be paid using PayPal, Venmo, or Cash App.
- Deposit verification is manual.
- Persona-approved users have full bidding eligibility.
- Deposit-verified users can bid only up to their approved tier.
- Category access is controlled by the tier required for that category.
- Auctions start immediately when published.
- The UI does not support future start scheduling in V1.
- Auction listings require an end date/time.
- There are no reserve prices in V1.
- There is no proxy bidding in V1.
- There is no soft-close or anti-sniping behavior in V1.
- Highest valid bidder wins when an auction ends.
- If an auction receives no bids, the item remains unsold.
- Winners and fixed-price buyers pay externally using PayPal, Venmo, or Cash App.
- The site records payment submission details and may include optional screenshot or proof uploads.
- Admin manually confirms or rejects submitted payments.
- Winner payment deadline defaults to 48 hours.
- If a winning bidder does not pay, admin may manually:
  - offer the item to the second-highest bidder
  - relist with the same settings
  - relist and edit
  - archive the item
  - mark the bidder as non-paying or block them
- Runner-up offers are manual and expire after 48 hours by default.
- Fulfillment modes are `pickup_only`, `shipping_only`, and `pickup_or_shipping`.
- Shipping is flat-fee only in V1.
- Pickup events are supported for batch item handoff.
- Money values should be modeled as integer cents.
- Timestamps should be modeled in UTC.
- Raw Persona document or ID images must not be stored in the app database.

## Statuses

### Listing Lifecycle

- `draft`: not visible to buyers
- `published`: visible and active
- `ended`: auction end reached and result determined
- `sold_pending_payment`: buyer or winner selected, awaiting payment review
- `paid`: payment accepted
- `ready_for_fulfillment`: payment accepted and fulfillment can proceed
- `fulfilled`: pickup completed or shipment completed
- `unsold`: auction ended with no bids
- `archived`: removed from active operations

### Auction Result And Payment Lifecycle

- `none`: no winning outcome yet
- `winner_pending_payment`: winning bidder selected, awaiting payment
- `payment_submitted`: buyer provided payment details or proof
- `payment_rejected`: admin rejected submission, buyer may resubmit before deadline
- `payment_confirmed`: admin accepted payment
- `payment_overdue`: payment deadline passed without approval
- `runner_up_offered`: admin manually offered to second-highest bidder
- `runner_up_expired`: runner-up window expired
- `closed_unpaid`: flow ended without collecting payment

### Verification Lifecycle

- `email_unverified`: account exists but email not confirmed
- `email_verified`: email confirmed, verification path may begin
- `persona_pending`: Persona flow started and awaiting outcome
- `persona_approved`: full bidding eligibility approved
- `persona_rejected`: Persona not approved
- `deposit_pending_review`: deposit evidence submitted and awaiting manual approval
- `deposit_approved_5`: approved for the `$5` tier
- `deposit_approved_10`: approved for the `$10` tier
- `deposit_approved_20`: approved for the `$20` tier
- `deposit_rejected`: deposit verification rejected
- `blocked`: account blocked from bidding or buying

### Fulfillment Lifecycle

- `not_selected`: no delivery choice made yet
- `pickup_selected`: buyer selected pickup
- `shipping_selected`: buyer selected shipping
- `pickup_scheduled`: assigned to a pickup event
- `label_pending`: shipping details still being prepared
- `in_transit`: shipped to buyer
- `picked_up`: collected in person
- `completed`: fulfillment complete

## Page List

### Public

- Home or marketplace landing page
- Browse or search listings
- Category listing pages
- Listing detail page
- Fixed-price claim entry point
- Basic policy or help pages as needed

### Account

- Sign-in and sign-up placeholders
- Email verification pages
- Verification choice page
- Persona verification flow pages
- Deposit verification submission and status pages
- Bidder eligibility and tier status page
- My bids, offers, purchases, and payment deadlines
- Payment submission page with optional proof upload
- Fulfillment selection and status pages

### Admin

- Admin dashboard
- Listing create, edit, publish, archive, and relist pages
- Category and required-tier management
- Bid history and auction monitoring
- Verification review queue
- Payment review queue
- Runner-up offer management
- Non-paying bidder review and blocking actions
- Pickup event creation and assignment

## Core Entities / Tables

- `users`
  - account identity, email verification state, blocking status
- `verification_records`
  - verification method, state, approved tier, admin notes, timestamps
- `categories`
  - category name, visibility, required verification tier
- `listings`
  - `seller_user_id`, type, title, status, start and end times, pricing, fulfillment mode, shipping fee cents
- `auction_bids`
  - listing, bidder, amount cents, placement time, validity flags
- `fixed_price_claims`
  - listing, claimant, claim time, claim status
- `payment_submissions`
  - listing or order reference, payer, external payment method, submitted details, optional proof location, review state
- `pickup_events`
  - event name, location, instructions, start and end timestamps
- `fulfillment_selections`
  - buyer choice, pickup event linkage, shipping details, fulfillment state
- `admin_actions`
  - audit trail for verification decisions, payment review, relisting, runner-up offers, blocking, and archive actions

## Edge Cases

- Simultaneous last-second bids must be resolved by recorded bid validity and timestamp order, with no soft-close extension.
- A deposit-verified user must be prevented from bidding above their approved tier.
- A user lacking required category access must be prevented from bidding or claiming.
- An auction that ends with no bids must become unsold rather than paid or fulfilled.
- A winning bidder who misses the payment deadline must remain a manual admin resolution case.
- A runner-up offer may expire after the default 48-hour window without converting to a sale.
- Payment proof can be rejected and resubmitted while the payment window is still open.
- A listing configured as pickup-only must not accept shipping fulfillment, and shipping-only must not allow pickup.
- Persona approval may unlock full eligibility, but raw Persona document media must never be stored in the app database.
- The publish flow must not include a future scheduled start option in V1.
