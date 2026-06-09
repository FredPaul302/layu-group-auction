import Link from "next/link";

import { BulkListingWorkspace } from "@/components/admin/bulk-listing-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { getListingEditorOptions } from "@/lib/catalog/service";

export default async function AdminBulkListingsPage() {
  const { categories } = await getListingEditorOptions();

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Link className="button-secondary px-4 py-2 text-sm font-medium" href="/admin/listings">
            Back to listings
          </Link>
        }
        description={
          <p>
            Build a media-first draft batch from manual rows, CSV data, photos, and videos.
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
              <span className="meta-label">Create mode</span>
              <span className="meta-value">Draft only</span>
            </div>
          </>
        }
        title="Bulk Listings"
      />

      {categories.length === 0 ? (
        <div className="notice notice-danger">
          Create at least one enabled category before importing listings.
        </div>
      ) : (
        <BulkListingWorkspace categories={categories} />
      )}
    </div>
  );
}

