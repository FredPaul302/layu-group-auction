import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminBidsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Bid monitoring"
      description="This route will later show bid history, validity flags, and closing outcomes for auction listings."
      bullets={[
        "There is no proxy bidding in V1.",
        "Highest valid bidder wins when the auction ends.",
        "No soft-close logic should appear here or elsewhere in V1."
      ]}
    />
  );
}
