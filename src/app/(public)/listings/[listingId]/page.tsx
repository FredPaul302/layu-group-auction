import { PlaceholderPage } from "@/components/placeholder-page";

type ListingDetailPageProps = {
  params: {
    listingId: string;
  };
};

export default function ListingDetailPage({ params }: ListingDetailPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Listing Detail"
      title={`Listing ${params.listingId}`}
      description="This dynamic route will later render a single auction or fixed-price listing, including fulfillment mode, manual payment instructions, and bidder eligibility gates."
      bullets={[
        "Future implementation will load the listing by slug or id from Prisma.",
        "Bid placement and fixed-price claims will be wired through API handlers and domain services.",
        "The detail page will surface shipping flat fees and pickup-event status when available."
      ]}
      links={[
        { href: `/listings/${params.listingId}/claim`, label: "Open claim placeholder" },
        { href: "/account/verification", label: "Check verification placeholder" }
      ]}
    />
  );
}
