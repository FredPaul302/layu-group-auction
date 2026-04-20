import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminOffersPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Runner-up offers"
      description="This route is reserved for the manual second-chance offer workflow after unpaid auction outcomes."
      bullets={[
        "Runner-up offers are manual in V1.",
        "Offer expiry defaults to 48 hours.",
        "A dedicated job script exists now as a stub for later implementation."
      ]}
    />
  );
}
