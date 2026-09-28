import { PlaceholderPage } from "@/components/placeholder-page";

type AdminVerificationDetailPageProps = {
  params: {
    verificationId: string;
  };
};

export default function AdminVerificationDetailPage({
  params
}: AdminVerificationDetailPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title={`Verification ${params.verificationId}`}
      description="This dynamic route will later carry the detailed review view for a single verification record."
      bullets={[
        "Manual decisions will be written back through API handlers and domain services.",
        "Edit deposit amounts and the launch auction limit under Admin > Deposit tiers. Only the first deposit tier is available during launch.",
        "The scaffold keeps verification state separate from UI concerns."
      ]}
    />
  );
}
