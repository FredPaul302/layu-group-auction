import { PlaceholderPage } from "@/components/placeholder-page";

type AdminListingDetailPageProps = {
  params: {
    listingId: string;
  };
};

export default function AdminListingDetailPage({
  params
}: AdminListingDetailPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title={`Listing ${params.listingId}`}
      description="This route is reserved for per-listing moderation, payment state review, archive actions, and manual runner-up decisions."
      bullets={[
        "Future admin actions will be written to an audit log table.",
        "Non-paying bidder flags and manual relists belong here or adjacent admin surfaces.",
        "The underlying domain rules remain unimplemented in this phase."
      ]}
      links={[{ href: `/admin/listings/${params.listingId}/edit`, label: "Edit listing" }]}
    />
  );
}
