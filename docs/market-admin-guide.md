# Market admin tools

Open [Layu Market](https://market.layu.llc) or the
[admin dashboard](https://market.layu.llc/admin). After the address change, sign in
again on the new hostname.

This release adds optional AI description drafts, adjustable buyer verification, and an inventory ledger to the existing auction and fixed-price market. It uses the existing application and PostgreSQL database; no additional always-running service is required.

When signed in as an administrator, **Account** in the top navigation opens your admin dashboard. Visiting `/account` also takes admins there, including after a normal login. Buyer accounts keep their usual dashboard.

## Sign-in and selling connections

The September 23 implementation adds **Admin → Connections** for account setup instructions and safe configuration status. Google and Facebook buttons appear only after the owner's application credentials are configured and the provider is explicitly enabled. Existing users connect and disconnect providers under **Account → Sign-in methods**. Follow [social sign-in setup](social-sign-in-setup.md) before enabling a provider; a configured provider still needs a real sign-in test.

In Listings or a completed bulk batch, select up to 100 items and choose **List selected elsewhere**. Alternatively open **Admin → List elsewhere**, select items and destinations, and choose **Prepare selected items**. Preparations are saved in the database and survive leaving the page. Repeating preparation preserves existing edits and posting records.

Review each destination's title, description, condition, and dollar price, then save. Copy the title/description and download the ordered photo ZIP for manual posting to personal Facebook Marketplace, eBay, Craigslist, or Mercari. Facebook Shop preparation requires actual eligibility and a supported catalog connection before publication. Save each published URL here after posting. Shopify also has a draft CSV export. Text and JSON downloads are preparation files, not universal marketplace upload formats.

When configured, select reviewed records to send Facebook business Page promotions or create unpublished Shopify drafts. The final confirmation shows the actual counts. Auctions stay on Layu and may only be promoted through Page posts; they are blocked from independently purchasable copies. Shopify drafts start with zero stock and need further review before activation. No automatic eBay publication or cross-channel stock synchronization is enabled in this release.

If a send result is uncertain, check the destination first. Save the existing post's URL if it succeeded. Only allow another attempt after confirming that no post/product was created. The dashboard flags external offers/promotions that need removal or updating after a Layu sale, auction closing, or deletion. For an external sale, remove/archive the other offers promptly and handle the sale in that destination. **Record removal** records your completed action; it does not remove posts remotely or change orders/payments.

See [cross-listing setup](cross-listing-setup.md) and [direct connection setup](cross-listing-direct-connections.md). Check the release note for actual deployment status; implementing these controls does not connect accounts automatically.

## Buyer protection

Open **Admin → Deposit tiers**, also available as **Deposit tiers & buyer protection** on the dashboard. Edit **First deposit tier**, **Second deposit tier**, and **No-deposit auction limit**, then select **Save tiers and verification**. Enter dollar amounts such as `2.50`; the second tier must exceed the first. The default values remain $1.00, $20.00, and $40.00. **Launch access** is enabled by default:

| Action | Launch requirement |
| --- | --- |
| Browse | Open to everyone |
| Buy It Now, at any price | Confirmed email; no deposit |
| Auction bid up to and including $40 | Confirmed email; no deposit |
| Auction bid or runner-up offer over $40 | Confirmed email and at least $1 in an approved account deposit |

The $40 limit uses the bid or offer amount before shipping. A bid that crosses $40 needs the approved deposit even if the item started below $40. Approved historical deposits retain their actual amounts and cover the $1 requirement. Pending, rejected, refunded, released, or forfeited deposits do not count. Identity approval alone does not replace the launch deposit requirement. Blocks and unresolved non-payment flags still prevent new purchases, bids, and offers. Existing orders remain payable.

Only the first tier can be requested during launch; the second is reserved for later. These amounts and the auction limit are configurable. Changes update the deposit choices, category labels, bulk editor, buyer guidance, and homepage announcement. Approved deposits count at their actual historical amounts toward the newly configured requirements; changing a tier never rewrites payment history. New bids and offer acceptances use the current settings, while existing bids and orders retain their commitments.

Disabling **Launch access** hides the launch announcement and reactivates the saved auction verification level and category requirements. Buy It Now remains deposit-free. Level 1 permits email-only auctions up to the configured reduced-verification limit, Level 2 permits the first deposit tier up to that limit, and Level 3 applies the category's deposit or identity requirement. Identity-only categories retain that requirement outside launch.

The same settings page accepts an optional **Homepage announcement video** URL: a YouTube video link or an HTTPS MP4/WebM link. The text announcement works without a video. A supplied video file can be added to the existing object storage and its URL saved here; this field does not itself upload a file.

## Saving unfinished bulk work

Price fields throughout the site use dollars and cents, including listing prices, shipping, category minimums, bids, payment submissions, and bulk rows. Enter `12.50` for $12.50. Saved bulk batches and AI suggestions display in these same units; older saved cent values retain their monetary value. CSV imports accept `price` and `startingBid` in dollars. Existing CSV columns explicitly ending in `Cents` remain compatible; do not include both unit formats for the same field.

At the top of **Bulk listings**, name the batch under **Save your place**. Changes save automatically after a short pause; **Save progress** saves immediately. Up to 100 incomplete rows are allowed. Titles, descriptions, prices, conditions, photo and video assignments, cover/order choices, AI previews and instructions, and the shared auction ending are retained. Saving progress does not create listing records or publish anything.

Wait for **Saved to your account** before leaving or changing devices. Under **Saved batches**, choose **Resume batch** from the same admin account to continue. **Recover work from this device** also offers browser recovery copies, including selected local files, when browser storage is available. A failed account save remains visible and the browser warns before leaving with unsaved changes. Browser recovery alone does not synchronize devices and can be removed by clearing browser data.

Unfinished batches protect their referenced inbox photos from deletion. Remove the photo from that batch and save, or delete the saved batch first. **Reset workspace** saves the current work before starting a new batch. Delete an inactive saved batch from **Saved batches**; existing listings and inbox originals remain available. Completed batches show their created listings and cannot be submitted twice. If two tabs edit the same batch, a stale save is rejected instead of silently replacing newer work. You can open the device recovery to inspect and copy unfinished text, then resume the newer account version and combine the edits yourself. A recovery copy is kept before switching versions.

## Bulk auctions and publishing

In the media list, choose **Create new item** beside the assignment badge, or **+ New item** in the **Add to** dropdown, to create an item row and assign that file immediately. A photo becomes the new item's cover image. **Add to previous item** assigns the current photo or video to the same item as the preceding file in the list; assign that preceding file first. The dropdown also lets you pick any other row. New rows are included in saved progress and use the shared auction ending when enabled. A batch supports up to 100 items.

Creating or assigning an item from the media list keeps the clicked control in the same place on screen, even when the item forms above it grow. Continue down the photo list without scrolling back to your last assignment.

For a bulk auction, open **Bulk listings** and leave **Use one auction end for all items** checked. It starts with a closing time ten days from opening the workspace. Enter any duration of at least one minute in days, hours, or minutes, or choose an exact closing date and time. The displayed time uses your local time zone; saved times use UTC. Changing the duration recalculates from now. The chosen end remains fixed during upload and publication. Existing auction rows, new rows, and CSV imports all use the same end while the option is checked; fixed-price rows are unaffected. Uncheck it to use individual row/CSV times. This does not schedule future starts.

At **Save or publish the batch**, choose **Publish now — skip drafts** to make the entire batch live in one step, or **Save drafts** to review first. After draft creation, the batch is selected for **Publish selected**. You can also open **Admin → Listings**, choose **Select drafts** or individual listings, and publish up to 100 together. Publishing keeps their selected end times. Every selected draft must have an enabled category, description, photo, valid pricing, and a future auction ending. If a selected item cannot be published, the whole action is rejected without partial publication.

In **Admin → Listings**, select unused drafts or other listings and choose **Delete selected**, then confirm. Any bid history, including withdrawn/invalid bids, or any order or runner-up offer prevents deletion. These checks also apply during concurrent buyer activity. Unused inventory allocations are released with an audit record. Deleting a listing is permanent; it does not delete bid or payment history. Media shared with other listings remains intact.

Category choices show the current configured deposit amounts. Original seeded category names no longer say Tier 5 or Tier 10; their existing URLs are preserved. During launch, the second tier remains reserved for later and the configured auction limit and first-tier rules apply across all categories.

## Photo inbox and viewing photos

Open **Bulk listings → Photo inbox** on your phone and choose **Upload photos for later**. No item title, price, category, or photo assignment is needed. JPEG, PNG, and WebP photos are supported, up to **20 MB per photo, 256 MB per selection, and 100 photos at a time**. Convert HEIC photos to JPEG first. The regular listing editor also accepts photos up to 20 MB; a listing batch can contain up to **1 GB of media across 100 listings** when using saved inbox photos. New file transfers are still limited to 256 MB at a time, with videos limited to 50 MB each.

After selection, the inbox checks file contents against your saved photos and against other photos in the selection. Review the results and choose **Upload new photos**. Identical copies are skipped even if renamed; edited or recompressed copies can count as new. Checks happen after the phone's native photo picker closes, before photo bytes are uploaded. Existing historical duplicate copies are preserved. Checks are private to the signed-in account and simultaneous uploads from two devices cannot add the same file twice.

Photos save one at a time with a filename, size, progress, and individual saved confirmation. Keep the page open until it finishes. A failed photo does not prevent the remaining photos from saving. **Recheck photos needing attention** checks the unfinished entries again before you upload, including checking whether a save succeeded before a connection dropped. An empty or unreadable file is reported separately from an oversized photo; interrupted transfers show a separate error. For iCloud, Google Photos, OneDrive, or other cloud sources, download the originals to your device before selecting them. Photos requiring a new local copy must be selected again using **Upload photos for later**.

**Sort saved photos** defaults to **Photo date — newest first**, using the camera's capture time where available, then the original file date, then upload time. Each card identifies its date source; dates display in the device's time zone. Camera times without an offset use the uploading device's time zone and are marked estimated. Choose oldest first, upload date in either direction, or filename A–Z/Z–A to match your gallery. The choice is remembered in that browser. **Most recently saved to your inbox** shows a reference thumbnail, filename, photo date, and saved time regardless of the chosen sort order.

On your computer, sign in with the same admin account and choose **Show saved photos / Refresh**. Choose **Select all** to select every saved photo, including photos below the visible area, or select individual photos. You can uncheck individual photos afterward or choose **Clear selection** to start again. The selection count and total size appear above the photos; each listing batch can use up to **1 GB** of saved photos. Saved photos are selected immediately without downloading and uploading the originals again. Choose **Use selected photos in this batch**, then assign them to item rows normally. Photos enter the workspace in the selected sort order, and saved copies remain in the inbox. **Save workspace photos for later** also saves photos already selected in the current workspace, including unassigned photos. The inbox holds photos; use **Save progress** above it to synchronize unfinished listing text, assignments and videos as a whole batch.

Saved photos are private to the uploading admin. Listings store separate copies, so removing an inbox photo does not remove it from a listing. Use **Remove selected from inbox** after you no longer need the saved copies.

In the public catalog, the main image and title open the listing. The photo count opens its gallery. On the item page, select any thumbnail or **View all photos** for an enlarged, uncropped view, with previous/next buttons and keyboard arrow navigation. Escape or **Close photos** closes the viewer; **Open original image** opens the full image separately.

## Auction + Buy It Now

In the listing editor, select **Auction + Buy It Now** and fill in the starting bid, Buy It Now price, and end time. The Buy It Now price must exceed the starting bid. For bulk uploads, select Auction and enter the optional Buy It Now price (CSV: `price`, in dollars).

The item appears in both browsing formats. Buy It Now remains available while the auction is live and bidding is below its Buy It Now price. Reserving at that price ends bidding immediately and creates one payment order, including when two requests arrive together. Existing bids stay in the history but are no longer winning. Manual payment approval and the payment deadline still apply.

An expired, rejected, or cancelled combined reservation leaves the item unsold for manual relisting. It never restarts the auction. Ordinary fixed-price reservations retain their existing release-to-catalog behavior.

## Descriptions

AI drafting now suggests an **estimated condition** as well as title and description. Review visible wear and the seller's confirmed notes; photos cannot establish working condition, authenticity, or completeness. **Apply title, description and condition** fills those three fields. **Apply all suggestions** also fills the suggested starting bid or fixed price, when a valid estimate is available. For a combined listing, the estimate changes the starting bid and leaves the Buy It Now price unchanged. All fields remain editable.

To revise a description, edit its text directly or enter **AI editing instructions** and select **Revise description with AI**. For example: “Shorten this to two sentences and keep the scratches and missing parts.” Review the preview and choose **Apply revised description**. This changes only the description. It works without photos when the item already has a title and description, and is available in both single-item and bulk editors.

Select photos in the listing editor and inspect their thumbnails beside the item details; click **Enlarge** for a closer look. Click **Describe uploaded photos** to suggest a title, description, estimated condition, and optional price in one request, using up to three newly selected photos and any facts you enter. Photos alone can start a draft, including when the title is empty; add testing results, missing parts, and included accessories because a photo cannot establish those facts reliably. Review the suggestions, then apply the fields you want or choose **Discard draft**. You can edit applied fields before saving the listing separately. Discarding leaves the original fields unchanged. Existing saved photos appear as thumbnails but are not automatically analyzed. **Draft with AI from notes** is also available for text-only drafting.

For multiple items, group the photos by item in the bulk uploader using the CSV, SKU, or manual tools. Uploading more photos preserves existing assignments and cover-photo order. **Auto-match media** explicitly rematches the whole batch. Thumbnails in the media list and item rows help you check these assignments; click **Enlarge** to inspect a photo. Click a row's **Describe photos** button or **Describe items with photos (N)** to draft up to 100 eligible rows before importing. Batch drafting runs one item at a time, skips rows with existing descriptions or drafts, and supports stopping. Review each row's suggestions before applying them. Changing the row's facts or analyzed photos makes an unapplied draft out of date. AI does not decide which photos belong to the same product, and viewing thumbnails does not use AI quota.

See [AI setup, photo workflow, and cost controls](ai-listing-descriptions.md). Generation requires explicit enablement with a server-side API key and selected provider. Gemini is selected for the existing deployment; OpenAI remains an explicit alternative. Title suggestions and thumbnails are live for single-item and bulk uploads. Analysis runs through the selected hosted provider using small browser-created photo copies, so there is no separate AI server to keep running. The original listing photos remain intact. Gemini usage can be free within the project's available Free-tier quota; verify the project remains on the Free plan before generating. The app never upgrades billing or switches providers automatically. Use only product photos and non-sensitive notes because Google's unpaid-service terms allow product improvement and human review of inputs and outputs. Public page views use the saved title and description and do not trigger AI usage. Verified appraisals, live price comparisons, and automatic publication are not included.

## Suggested prices

Leave **Also suggest a price** selected when drafting from photos or notes to receive an estimated USD resale range and a suggested fixed price or auction starting bid. Review its explanation and choose **Apply all suggestions**, or apply the price separately. **Apply title, description and condition** leaves the price unchanged. Save or import normally after reviewing. Manual edits invalidate stale suggestions. These are rough estimates from the model's general knowledge and your item details, without checking recent sold listings. Auction items can sell at the starting bid; category minimums still apply. See [the price workflow and limits](ai-listing-descriptions.md#price-suggestions).

## Automatic SKUs

Leave SKU blank when creating a listing to receive a six-digit number such as `000001`, `000002`, or `000003`. The database assigns the number when the item is saved or imported, so simultaneous upload tabs cannot issue the same automatic number. Numbers are stored as text to retain their leading zeros. A custom SKU may be supplied instead; short numeric entries such as `1` become `000001`.

Saved SKUs stay with their listing. Editing does not renumber an item; creating copies, duplicating, or relisting creates new listing records with fresh automatic numbers. For the single-item **Create copies** option, a supplied custom SKU applies to the first copy and the others receive automatic numbers. Existing listings without a SKU receive one when next saved. Bulk CSV files can omit the SKU column entirely; use photo thumbnails/manual assignment or a separate media prefix to group photos before a number exists.

Automatic numbering skips numbers already used by the seller's listings or inventory. Deleted or rolled-back numbers are not reused, so gaps can occur. Automatic numbers stop at `999999` rather than wrapping; custom SKUs remain available. A listing SKU identifies that sale listing; the Inventory ledger retains its separate stock SKU and explicit stock-to-listing allocation.

## Inventory from arrival to sale

1. Open **Admin → Purchase orders** and download the CSV template. The required columns are `sku,title,quantity,unit_cost`; `location` is optional. Costs are dollar amounts such as `12.50`, not cents. Use one row per SKU and combine duplicates. Import is limited to 500 rows / 100 KB.
2. Enter a supplier and a unique purchase-order reference, then upload or paste the CSV. Review the preview and save the draft. Saving the draft does not add stock.
3. Review the saved draft and choose **Receive into stock** when the goods arrive. All lines are received together. Receiving the same order again does not double the stock. Partial receipts and scanned/PDF purchase orders are not included; use a separate reference per shipment.
4. Open **Admin → Inventory** to search SKU, item title, or location, view stock, and download a CSV export. Existing listings do not automatically become inventory; link them deliberately so acquisition cost is meaningful.
5. Open an inventory item and assign one unit to an existing listing. Create the listing through the normal auction/fixed-price editor first if needed. Assignment freezes its acquisition cost. Every listing represents one unit; assign a different unit to each separate listing.
6. Record stock adjustments with a reason. Positive adjustments require a per-unit cost; negative adjustments remove unassigned stock at its current average cost. Each receipt, adjustment, assignment, release, and selling-cost change leaves a timestamped history with the acting admin ID.
7. Record each sold item's payment fees, actual outbound shipping, packaging, and other direct selling costs in its **Selling costs** amount. The displayed contribution uses paid order revenue, including shipping charged to the buyer, minus acquisition and entered selling costs. Costs left at zero are treated as zero; this is contribution based on entered costs before overhead, taxes, returns, and unrecorded expenses, not verified net profit.

Stock quantities distinguish **on hand** (includes paid items awaiting fulfillment), **available to list** (unassigned units), assigned units, paid units, and fulfilled units. Fulfillment reduces on-hand stock automatically through the linked order status. Never enter a second negative adjustment for the same linked sale. Receipts and positive adjustments average the acquisition cost of unassigned units; costs already assigned to listings stay fixed. This is operational cost tracking with cent rounding, not a tax inventory valuation system.

Release an unused assignment before cloning or relisting its listing; then assign the unit to the replacement listing. Paid items and active commitments cannot be released. An archived/unsold listing can be released after its unpaid orders are cancelled and offers are resolved. Linked stock cannot be cloned into another listing automatically. An unlinked listing can still be sold by the existing market, so assignment is necessary for inventory and contribution reports to include that sale.

Existing SKUs keep their original title and location when received again; incoming CSV titles/locations are retained on the purchase-order lines. SKU matching is uppercase within the seller account. Inventory is scoped to the authenticated seller/admin account; V1 does not introduce a multi-seller marketplace.

## Future channels

The current CSV export is a general inventory report, not a Shopify product import or live stock sync. Read [commerce integration options](commerce-integration-options.md) before choosing a subscription or integration. SKU and listing associations provide a starting point; channel IDs, location mappings, order import, and stock reconciliation would be a separate implementation.

See [marketplace cross-listing options](marketplace-cross-listing-options.md) for the Facebook-first proposal and current eBay, Craigslist, Mercari, and Shopify integration boundaries.

## Release steps

Apply pending migrations using the established release process before starting the new application version:

```sh
pnpm db:generate
pnpm db:migrate:deploy
pnpm exec tsx scripts/backfill-photo-inbox.ts --time-zone America/New_York
```

The photo metadata migration is additive. Run the backfill with the appropriate IANA camera time zone to index existing photos for duplicate checks and recover capture dates; unknown offsets are marked estimated. It preserves every photo, filename, storage object, and upload timestamp, including historical duplicates. Files without camera metadata keep the labeled upload-date fallback because their original device file date was not previously retained. A second run processes only records not already indexed; run it again after deployment to include photos uploaded by the previous version during rollout. Unreadable storage objects produce a nonzero exit status for investigation.

The launch migration adds the launch access and video settings and consolidates legacy $10 category/profile tiers into the $1 tier. Actual historical deposit amounts and payment records are preserved. Earlier migrations provide the inventory ledger, saved verification levels, and automatic SKU numbering. Deploy the app and review **Buyer protection**. Configure the optional AI key/enablement only when ready to use metered drafting. No Shopify subscription or additional always-running service is created by this change.
