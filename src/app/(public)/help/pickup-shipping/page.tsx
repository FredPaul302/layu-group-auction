import { PlaceholderPage } from "@/components/placeholder-page";

export default function HelpPickupShippingPage() {
  return (
    <PlaceholderPage
      eyebrow="Help"
      title="Pickup and shipping"
      description="This placeholder explains the fulfillment modes the app is being scaffolded around: pickup-only, shipping-only, and pickup-or-shipping."
      bullets={[
        "Shipping remains flat-fee only in V1.",
        "Pickup events are planned as batch handoff entities for paid items.",
        "Mode mismatches will be rejected by domain logic rather than hidden in the UI."
      ]}
      links={[
        { href: "/admin/pickup-events", label: "Admin pickup events placeholder" },
        { href: "/account/fulfillment/demo-listing", label: "Fulfillment status placeholder" }
      ]}
    />
  );
}
