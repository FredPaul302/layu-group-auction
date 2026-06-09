/* eslint-disable @next/next/no-img-element */

import type { AdminListingRecord } from "@/lib/catalog/service";

type ListingImageManagerProps = {
  listing: AdminListingRecord;
  saveAction: (formData: FormData) => void | Promise<void>;
  removeAction: (imageId: string, formData: FormData) => void | Promise<void>;
};

export function ListingImageManager({
  listing,
  saveAction,
  removeAction
}: ListingImageManagerProps) {
  return (
    <section className="surface-card fade-in space-y-4 p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-zinc-950">Gallery manager</h3>
        <p className="text-sm text-zinc-600">
          Choose the cover image, adjust gallery order, and remove any file you no longer want on
          the listing.
        </p>
      </div>

      {listing.images.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Upload images above, then return here to set the cover image and gallery order.
        </p>
      ) : (
        <form action={saveAction} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {listing.images.map((image) => (
              <article key={image.id} className="surface-elevated overflow-hidden">
                <img
                  alt={image.altText ?? listing.title}
                  className="h-44 w-full object-cover"
                  src={image.publicUrl}
                />

                <div className="space-y-4 p-4">
                  <label className="flex items-center gap-3 text-sm text-zinc-700">
                    <input
                      defaultChecked={image.isPrimary}
                      name="primaryImageId"
                      type="radio"
                      value={image.id}
                    />
                    <span className="font-medium text-zinc-900">Use as cover image</span>
                  </label>

                  <label className="space-y-2 text-sm text-zinc-700">
                    <span className="font-medium text-zinc-900">Alt text</span>
                    <input
                      defaultValue={image.altText ?? listing.title}
                      name={`altText:${image.id}`}
                      type="text"
                    />
                  </label>

                  <label className="space-y-2 text-sm text-zinc-700">
                    <span className="font-medium text-zinc-900">Gallery order</span>
                    <input
                      defaultValue={image.sortOrder + 1}
                      min={1}
                      name={`sortOrder:${image.id}`}
                      step={1}
                      type="number"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-500">
                      {image.isPrimary ? "Current cover image" : "Gallery image"}
                    </span>
                    <button
                      className="button-ghost px-0 py-0 text-sm font-medium text-red-700"
                      formAction={removeAction.bind(null, image.id)}
                      type="submit"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="flex justify-end">
            <button className="button-primary px-4 py-2 text-sm font-medium" type="submit">
              Save gallery changes
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
