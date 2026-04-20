import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminListingsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Listings"
      description="This page will become the listing management queue for drafts, published listings, relists, and archival actions."
      bullets={[
        "Auction listings will start immediately when published in V1.",
        "Scheduled future starts should remain out of scope at the UI level.",
        "Relist same settings and relist-with-edit workflows will be built later."
      ]}
      links={[
        { href: "/admin/listings/new", label: "Create listing" },
        { href: "/admin/categories", label: "Manage categories" }
      ]}
    />
  );
}
