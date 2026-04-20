import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminOrdersPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Orders"
      description="This scaffolded admin page will later consolidate auction wins and fixed-price claims that require payment and fulfillment handling."
      bullets={[
        "This repo treats orders as an operational view over wins and claims rather than a separate finalized domain yet.",
        "Payment overdue handling is already represented by a dedicated job stub.",
        "Manual outcomes remain the default for unpaid orders in V1."
      ]}
    />
  );
}
