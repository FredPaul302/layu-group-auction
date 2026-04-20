import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminListingsNewPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Create listing"
      description="This route will hold the listing creation form once schema-backed listing management is implemented."
      bullets={[
        "Auctions will require an end date and time.",
        "Reserve prices and scheduled starts are intentionally excluded.",
        "seller_user_id will be preserved in the schema even though V1 is single-seller."
      ]}
    />
  );
}
