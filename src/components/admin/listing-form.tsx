/* eslint-disable @next/next/no-img-element */

import type { Category, PickupEvent } from "@prisma/client";

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
  submitLabel
}: ListingFormProps) {
  return (
    <form action={action} className="space-y-8" encType="multipart/form-data">
      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
        {sectionTitle(
          "Listing basics",
          "Listings can be saved as drafts or published immediately. Bidding and purchase actions stay disabled in this phase."
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Title</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.title ?? ""}
              name="title"
              required
              type="text"
            />
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
              defaultValue={listing?.listingType ?? "auction"}
              name="listingType"
            >
              <option value="auction">Auction</option>
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

        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Description</span>
          <textarea
            className="min-h-32 w-full rounded-md border border-zinc-300 px-3 py-2"
            defaultValue={listing?.description ?? ""}
            name="description"
          />
        </label>

        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Condition note</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
            defaultValue={listing?.conditionNote ?? ""}
            name="conditionNote"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
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
            <span className="font-medium text-zinc-900">Shipping fee cents</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.shippingFeeCents ?? 0}
              min={0}
              name="shippingFeeCents"
              required
              step={1}
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

      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
        {sectionTitle(
          "Pricing",
          "Auction listings need a starting bid and end time. Fixed-price listings only use the fixed-price field."
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Fixed price cents</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.fixedPriceCents ?? ""}
              min={1}
              name="fixedPriceCents"
              step={1}
              type="number"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Starting bid cents</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={listing?.auction?.startingBidCents ?? ""}
              min={0}
              name="startingBidCents"
              step={1}
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

      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
        {sectionTitle(
          "Images",
          "Uploads are stored with the existing local development adapter and displayed on public listing pages."
        )}

        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Upload images</span>
          <input
            accept="image/*"
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            multiple
            name="images"
            type="file"
          />
        </label>

        {listing?.images.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listing.images.map((image) => (
              <div key={image.id} className="overflow-hidden rounded-md border border-zinc-200">
                <img
                  alt={image.altText ?? listing.title}
                  className="h-40 w-full object-cover"
                  src={image.publicUrl}
                />
                <div className="space-y-1 p-3 text-xs text-zinc-600">
                  <p>{image.storageKey}</p>
                  <p>{image.isPrimary ? "Primary image" : "Gallery image"}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No images uploaded yet.</p>
        )}
      </section>

      <div className="flex justify-end">
        <button
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
