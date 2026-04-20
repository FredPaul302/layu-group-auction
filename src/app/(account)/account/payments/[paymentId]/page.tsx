import { PlaceholderPage } from "@/components/placeholder-page";

type AccountPaymentPageProps = {
  params: {
    paymentId: string;
  };
};

export default function AccountPaymentPage({ params }: AccountPaymentPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title={`Payment ${params.paymentId}`}
      description="This route is scaffolded for viewing and resubmitting manual external payment details."
      bullets={[
        "Future implementation will support optional screenshot or proof uploads.",
        "Admin may reject a payment submission and allow resubmission before the deadline.",
        "No on-site card processing is planned."
      ]}
    />
  );
}
