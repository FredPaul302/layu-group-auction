import { PlaceholderPage } from "@/components/placeholder-page";

export default function AccountOffersPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Runner-up offers"
      description="This page will eventually show manual second-chance offers created by admin after unpaid auction outcomes."
      bullets={[
        "Runner-up offers are manual in V1.",
        "The default response window is 48 hours.",
        "Offer expiry will be handled by a dedicated background job."
      ]}
    />
  );
}
