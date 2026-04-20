import { ListingForm } from "@/components/admin/listing-form";
import { createListingAction } from "@/lib/catalog/actions";
import { getListingEditorOptions, readStatusQueryParam } from "@/lib/catalog/service";

type AdminListingsNewPageProps = {
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

export default async function AdminListingsNewPage({
  searchParams
}: AdminListingsNewPageProps) {
  const resolvedSearchParamsPromise =
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>);
  const [{ categories, pickupEvents }, resolvedSearchParams] = await Promise.all([
    getListingEditorOptions(),
    resolvedSearchParamsPromise
  ]);
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Create listing</h2>
        <p className="max-w-3xl text-base text-zinc-600">
          Listings can be saved as drafts or published immediately. Auction listings require a
          starting bid and end time, and fixed-price listings stay purchase-disabled for now.
        </p>
      </section>

      {categories.length === 0 ? (
        <Feedback
          message="Create at least one category before creating listings."
          tone="error"
        />
      ) : null}
      {error ? (
        <Feedback
          message={`Listing could not be saved (${error.replaceAll("_", " ")}).`}
          tone="error"
        />
      ) : null}

      {categories.length > 0 ? (
        <ListingForm
          action={createListingAction}
          categories={categories}
          pickupEvents={pickupEvents}
          submitLabel="Create listing"
        />
      ) : null}
    </div>
  );
}
