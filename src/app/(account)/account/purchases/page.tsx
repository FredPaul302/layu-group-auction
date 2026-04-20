import { PlaceholderPage } from "@/components/placeholder-page";

export default function AccountPurchasesPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Purchases and wins"
      description="This route will collect fixed-price claims and auction wins, along with payment and fulfillment status."
      bullets={[
        "Payment deadlines default to 48 hours.",
        "External payment submission will remain part of the core order flow.",
        "Fulfillment selection will branch to pickup or shipping after payment acceptance."
      ]}
      links={[{ href: "/account/payments/demo-payment", label: "Payment submission status" }]}
    />
  );
}
