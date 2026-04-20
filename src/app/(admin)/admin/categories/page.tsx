import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminCategoriesPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Categories"
      description="This route is reserved for category management, including required deposit-tier access rules."
      bullets={[
        "Category access is part of the verification model, not a UI-only concern.",
        "Deposit-verified users may bid only up to their approved tier.",
        "Persona-approved users will get full bidding eligibility."
      ]}
    />
  );
}
