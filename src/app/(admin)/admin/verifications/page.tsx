import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminVerificationsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Verification review"
      description="This route is reserved for the combined verification review queue spanning hosted identity status reconciliation and manual deposit approval."
      bullets={[
        "Raw identity document images must never be stored in the database.",
        "Deposit verification is manual and tier-based.",
        "Verification outcomes should remain auditable."
      ]}
    />
  );
}
