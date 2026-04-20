import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingForm } from "@/components/admin/listing-form";
import { archiveListingAction, updateListingAction } from "@/lib/catalog/actions";
import { getListingEditorData, getListingEditorOptions, readStatusQueryParam } from "@/lib/catalog/service";

type AdminListingEditPageProps = {
  params: Promise<{
    listingId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
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
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
            <h2 className="text-3xl font-semibold text-zinc-950">Edit listing</h2>
            <p className="max-w-3xl text-base text-zinc-600">
              Update catalog content without enabling bidding or purchase actions. seller_user_id
              stays preserved on the listing record.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              className="font-medium text-emerald-700 hover:text-emerald-800"
              href={`/admin/listings/${listing.id}`}
            >
              View summary
            </Link>
            {listing.status !== "archived" ? (
              <form action={archiveListingAction.bind(null, listing.id)}>
                <button className="font-medium text-red-700 hover:text-red-800" type="submit">
                  Archive listing
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      {status === "listing_created" ? <Feedback message="Listing created." tone="success" /> : null}
      {status === "listing_updated" ? <Feedback message="Listing updated." tone="success" /> : null}
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
    </div>
  );
}
