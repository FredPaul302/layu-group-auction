import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminPaymentsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Payment review"
      description="This route will hold the queue for manually accepting or rejecting external payment submissions."
      bullets={[
        "Only PayPal, Venmo, and Cash App are planned as manual external-payment methods in V1.",
        "Payment proof is optional but supported in the data model.",
        "Winner and buyer payment deadlines default to 48 hours."
      ]}
    />
  );
}
