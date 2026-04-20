import { PlaceholderPage } from "@/components/placeholder-page";

export default function HelpPaymentsPage() {
  return (
    <PlaceholderPage
      eyebrow="Help"
      title="Payment instructions"
      description="This route will eventually explain how winners and buyers submit external payment details for PayPal, Venmo, or Cash App."
      bullets={[
        "No processor APIs are integrated in V1.",
        "Payment proof remains optional but supported in the data model.",
        "Admin review decides whether a submission is accepted or rejected."
      ]}
      links={[{ href: "/account/payments/demo-payment", label: "Payment status placeholder" }]}
    />
  );
}
