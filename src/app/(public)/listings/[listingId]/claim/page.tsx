import { PlaceholderPage } from "@/components/placeholder-page";

type ClaimPageProps = {
  params: {
    listingId: string;
  };
};

export default function ListingClaimPage({ params }: ClaimPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Fixed Price"
      title={`Claim ${params.listingId}`}
      description="This route is scaffolded for fixed-price claim entry. Later work will validate verification status, claim availability, and external payment submission."
      bullets={[
        "Claim logic is intentionally absent in this phase.",
        "Manual payment confirmation remains the expected V1 flow.",
        "The final version will record claims before payment review and fulfillment selection."
      ]}
    />
  );
}
