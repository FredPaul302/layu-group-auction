import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingImageManager } from "@/components/admin/listing-image-manager";
import { ListingForm } from "@/components/admin/listing-form";
import { PageHeader } from "@/components/ui/page-header";
import {
  archiveListingAction,
  removeListingImageAction,
  updateListingAction,
  updateListingImagesAction
} from "@/lib/catalog/actions";
import { getListingEditorData, getListingEditorOptions, readStatusQueryParam } from "@/lib/catalog/service";

type AdminListingEditPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div className={tone === "error" ? "notice notice-danger" : "notice notice-success"}>
      {message}
    </div>
  );
}

export default async function AdminListingEditPage({
  params,
  searchParams
}: AdminListingEditPageProps) {
  const { listingId } = await params;
  const resolvedSearchParams = await (
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const [{ categories, pickupEvents }, listing] = await Promise.all([
    getListingEditorOptions(),
    getListingEditorData(listingId).catch(() => notFound())
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Link
              className="button-secondary px-4 py-2 text-sm font-medium"
              href={`/admin/listings/${listing.id}`}
            >
              Admin preview
            </Link>
            {listing.status !== "draft" && listing.status !== "archived" ? (
              <Link
                className="button-secondary px-4 py-2 text-sm font-medium"
                href={`/listings/${listing.id}`}
              >
                View public page
              </Link>
            ) : null}
            {listing.status === "draft" ? (
              <form action={`/api/admin/listings/${listing.id}/publish`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  Publish
                </button>
              </form>
            ) : null}
            {listing.status === "published" ? (
              <form action={`/api/admin/listings/${listing.id}/unpublish`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  Unpublish
                </button>
              </form>
            ) : null}
            {listing.listingType === "auction" &&
            listing.status === "published" &&
            listing.auction?.status === "live" ? (
              <form action={`/api/admin/listings/${listing.id}/close`} method="post">
                <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                  End auction now
                </button>
              </form>
            ) : null}
            <form action={`/api/admin/listings/${listing.id}/duplicate`} method="post">
              <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
                Duplicate into draft
              </button>
            </form>
            {listing.status !== "archived" ? (
              <form action={archiveListingAction.bind(null, listing.id)}>
                <button className="button-ghost px-0 py-0 text-sm font-medium text-red-700" type="submit">
                  Archive listing
                </button>
              </form>
            ) : null}
          </>
        }
        description={
          <p>
            Update catalog content, save drafts, and publish when ready. seller_user_id stays
            preserved on the listing record, and auction timing only changes when you publish or
            manually end the auction.
          </p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Status</span>
              <span className="meta-value">{listing.status}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Categories</span>
              <span className="meta-value tabular-data">{categories.length}</span>
            </div>
          </>
        }
        title="Edit listing"
      />

      {status === "listing_created" ? <Feedback message="Listing created." tone="success" /> : null}
      {status === "listing_updated" ? <Feedback message="Listing updated." tone="success" /> : null}
      {status === "listing_published" ? <Feedback message="Listing published." tone="success" /> : null}
      {status === "listing_unpublished" ? <Feedback message="Listing moved back to draft." tone="success" /> : null}
      {status === "listing_duplicated" ? <Feedback message="Draft duplicate created." tone="success" /> : null}
      {status === "listing_images_updated" ? (
        <Feedback message="Listing gallery updated." tone="success" />
      ) : null}
      {status === "listing_image_removed" ? (
        <Feedback message="Listing image removed." tone="success" />
      ) : null}
      {error ? (
        <Feedback
          message={`Listing could not be saved (${error.replaceAll("_", " ")}).`}
          tone="error"
        />
      ) : null}

      <ListingForm
        action={updateListingAction.bind(null, listing.id)}
        categories={categories}
        listing={listing}
        pickupEvents={pickupEvents}
        submitLabel="Save listing changes"
      />

      <ListingImageManager
        listing={listing}
        removeAction={removeListingImageAction.bind(null, listing.id)}
        saveAction={updateListingImagesAction.bind(null, listing.id)}
      />
    </div>
  );
}
