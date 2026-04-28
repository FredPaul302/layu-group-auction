import { ListingForm } from "@/components/admin/listing-form";
import { PageHeader } from "@/components/ui/page-header";
import { createListingAction } from "@/lib/catalog/actions";
import { getListingEditorOptions, readStatusQueryParam } from "@/lib/catalog/service";

type AdminListingsNewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div className={tone === "error" ? "notice notice-danger" : "notice notice-success"}>
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
  const status = readStatusQueryParam(resolvedSearchParams.status);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Save drafts, publish immediately, or stamp out multiple fixed-price listings at once.
            Drafts can be reviewed from the admin preview before they go live.
          </p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Available categories</span>
              <span className="meta-value tabular-data">{categories.length}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Pickup events</span>
              <span className="meta-value tabular-data">{pickupEvents.length}</span>
            </div>
          </>
        }
        title="Create listing"
      />

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
      {status === "listing_batch_created" ? (
        <Feedback message="Listings created." tone="success" />
      ) : null}

      {categories.length > 0 ? (
        <ListingForm
          action={createListingAction}
          categories={categories}
          pickupEvents={pickupEvents}
          showBatchOptions
          submitLabel="Create listing"
        />
      ) : null}
    </div>
  );
}
