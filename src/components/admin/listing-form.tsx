import type { Category, PickupEvent } from "@prisma/client";
import { centsToDollars } from "@/lib/money";

import { ListingDescriptionField } from "@/components/admin/listing-description-field";
import { isListingDescriptionDraftEnabled } from "@/lib/ai/listing-description";
import type { AdminListingRecord } from "@/lib/catalog/service";
import {
  formatDateTimeLocalValue,
  formatUtcDateTime
} from "@/lib/catalog/presentation";

type ListingFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  categories: Category[];
  pickupEvents: Array<Pick<PickupEvent, "id" | "name" | "startAtUtc" | "endAtUtc">>;
  listing?: AdminListingRecord;
  showBatchOptions?: boolean;
  submitLabel: string;
};

function sectionTitle(label: string, description: string) {
  return (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-zinc-950">{label}</h3>
      <p className="text-sm text-zinc-600">{description}</p>
    </div>
  );
}

export function ListingForm({
  action,
  categories,
  pickupEvents,
  listing,
  showBatchOptions = false,
  submitLabel
}: ListingFormProps) {
  return (
    <form action={action} className="space-y-8">
      <section className="surface-card fade-in space-y-4 p-6">
        {sectionTitle(
          "Listing basics",
          "Listings can be saved as drafts or published immediately. Published listings accept bids or purchases once the buyer confirms their email and meets any auction deposit requirement."
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">SKU</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.sku ?? ""}
              maxLength={80}
              name="sku"
              placeholder="Assigned automatically when saved"
              readOnly={Boolean(listing?.sku)}
              type="text"
            />
            <span className="block text-xs text-zinc-500">
              {listing?.sku ? "This saved SKU stays with the item." : "Leave blank for an automatic six-digit SKU, or enter your own. A number is assigned when you save."}
            </span>
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Category</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.categoryId ?? categories[0]?.id ?? ""}
              name="categoryId"
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Listing type</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.listingType === "auction" && listing.fixedPriceCents ? "auction_buy_now" : listing?.listingType ?? "auction"}
              name="listingType"
            >
              <option value="auction">Auction</option>
              <option value="auction_buy_now">Auction + Buy It Now</option>
              <option value="fixed_price">Fixed price</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Save as</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.status === "published" ? "published" : "draft"}
              name="saveAs"
            >
              <option value="draft">Draft</option>
              <option value="published">Published now</option>
            </select>
          </label>
        </div>

        {showBatchOptions ? (
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Create copies</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={1}
              max={25}
              min={1}
              name="createCount"
              step={1}
              type="number"
            />
            <span className="block text-xs text-zinc-500">
              Fixed-price listings can be created in batches. Auctions always create a single listing.
            </span>
          </label>
        ) : null}

        <ListingDescriptionField
          aiEnabled={isListingDescriptionDraftEnabled()}
          initialDescription={listing?.description ?? ""}
          initialCondition={listing?.conditionNote ?? ""}
          initialTitle={listing?.title ?? ""}
          key={listing?.id ?? "new"}
          savedImages={listing?.images.map((image) => ({
            id: image.id,
            src: image.publicUrl,
            filename: image.storageKey.split("/").at(-1) ?? "Saved photo",
            alt: image.altText ?? listing.title
          }))}
        />

      </section>

      <section className="surface-card fade-in space-y-4 p-6">
        {sectionTitle(
          "Fulfillment",
          "Shipping is flat-fee only. Pickup events can be attached to pickup-capable listings."
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Fulfillment mode</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.fulfillmentMode ?? "pickup_only"}
              name="fulfillmentMode"
            >
              <option value="pickup_only">Pickup only</option>
              <option value="shipping_only">Shipping only</option>
              <option value="pickup_or_shipping">Pickup or shipping</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Shipping fee ($)</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={centsToDollars(listing?.shippingFeeCents ?? 0)}
              min={0}
              name="shippingFee"
              required
              step="0.01"
              inputMode="decimal"
              type="number"
            />
          </label>
        </div>

        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Shipping notes</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
            defaultValue={listing?.shippingNotes ?? ""}
            name="shippingNotes"
          />
        </label>

        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Pickup event</span>
          <select
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            defaultValue={listing?.pickupEventId ?? ""}
            name="pickupEventId"
          >
            <option value="">No pickup event</option>
            {pickupEvents.map((pickupEvent) => (
              <option key={pickupEvent.id} value={pickupEvent.id}>
                {pickupEvent.name} ({formatUtcDateTime(pickupEvent.startAtUtc)} to{" "}
                {formatUtcDateTime(pickupEvent.endAtUtc)})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="surface-card fade-in space-y-4 p-6">
        {sectionTitle(
          "Pricing",
          "For Auction + Buy It Now, enter all three fields. The Buy It Now price must exceed the starting bid. Buying ends bidding immediately; Buy It Now closes when bidding reaches that price or the auction ends. For auction only, leave Buy It Now blank."
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Buy It Now price ($)</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={centsToDollars(listing?.fixedPriceCents)}
              min="0.01"
              name="fixedPrice"
              step="0.01"
              inputMode="decimal"
              type="number"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Starting bid ($)</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={centsToDollars(listing?.auction?.startingBidCents)}
              min={0}
              name="startingBid"
              step="0.01"
              inputMode="decimal"
              type="number"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Auction end</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={formatDateTimeLocalValue(listing?.auction?.endAtUtc)}
              name="endAtUtc"
              type="datetime-local"
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          className="button-primary px-4 py-2 text-sm font-medium"
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
