import { PlaceholderPage } from "@/components/placeholder-page";

type AccountFulfillmentPageProps = {
  params: {
    listingId: string;
  };
};

export default function AccountFulfillmentPage({
  params
}: AccountFulfillmentPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title={`Fulfillment ${params.listingId}`}
      description="This placeholder route will later collect pickup or shipping choices after payment confirmation."
      bullets={[
        "Shipping is flat-fee only in V1.",
        "Pickup-only listings must not accept shipping, and shipping-only listings must not accept pickup.",
        "Pickup events will group multiple items for batch handoff."
      ]}
    />
  );
}
