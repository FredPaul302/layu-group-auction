import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminPaymentMethodsSettingsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Payment method settings"
      description="This route is reserved for configuring the PayPal, Venmo, and Cash App handles or links surfaced to buyers."
      bullets={[
        "V1 uses external payment links and handles rather than card processing.",
        "Environment placeholders already exist for the payment handles.",
        "Future work may add admin-editable settings backed by persistent storage."
      ]}
    />
  );
}
