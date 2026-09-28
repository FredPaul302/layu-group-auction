import Link from "next/link";

import { BulkListingWorkspace } from "@/components/admin/bulk-listing-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { getListingEditorOptions } from "@/lib/catalog/service";
import { isListingDescriptionDraftEnabled } from "@/lib/ai/listing-description";
import { requireAdminUser } from "@/lib/auth";
import { getVerificationPolicy } from "@/lib/verification/policy-service";

export default async function AdminBulkListingsPage() {
  const admin = await requireAdminUser();
  const [{ categories }, verificationPolicy] = await Promise.all([getListingEditorOptions(), getVerificationPolicy()]);

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
            Save photos from any device, prepare a batch, then save drafts or publish all items together.
          </p>
        }
        eyebrow="Admin"
        title="Bulk Listings"
      />

      {categories.length === 0 ? (
        <div className="notice notice-danger">
          Create at least one enabled category before importing listings.
        </div>
      ) : (
        <BulkListingWorkspace ownerId={admin.id} aiEnabled={isListingDescriptionDraftEnabled()} categories={categories} verificationPolicy={verificationPolicy} />
      )}
    </div>
  );
}
