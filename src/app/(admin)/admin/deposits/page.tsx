import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminDepositsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Deposits"
      description="This route is reserved for manual deposit verification review and tier assignment."
      bullets={[
        "Deposit methods are limited to PayPal, Venmo, and Cash App in V1.",
        "Approved tiers remain capped at $5, $10, and $20.",
        "Deposit review should remain auditable and decoupled from UI rendering."
      ]}
    />
  );
}
