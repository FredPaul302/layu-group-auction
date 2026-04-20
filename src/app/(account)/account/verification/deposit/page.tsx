import { PlaceholderPage } from "@/components/placeholder-page";

export default function DepositVerificationPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Deposit verification"
      description="This page will later guide users through submitting a refundable deposit through PayPal, Venmo, or Cash App for manual admin review."
      bullets={[
        "Deposit tiers are scaffolded at $5, $10, and $20 equivalents in cents.",
        "Admin review remains part of the core V1 flow.",
        "Tier approval will later drive maximum bidding eligibility and category access."
      ]}
      links={[{ href: "/admin/deposits", label: "Admin deposit review placeholder" }]}
    />
  );
}
