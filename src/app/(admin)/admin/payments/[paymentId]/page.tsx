import { PlaceholderPage } from "@/components/placeholder-page";

type AdminPaymentDetailPageProps = {
  params: {
    paymentId: string;
  };
};

export default function AdminPaymentDetailPage({
  params
}: AdminPaymentDetailPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title={`Payment ${params.paymentId}`}
      description="This dynamic route will later show a specific payment submission, optional proof metadata, and review actions."
      bullets={[
        "Future implementation will track accepted and rejected states explicitly.",
        "Rejected payments may be resubmitted before deadline expiry.",
        "Proof storage will flow through the storage adapter abstraction."
      ]}
    />
  );
}
