import { PlaceholderPage } from "@/components/placeholder-page";

type AdminListingEditPageProps = {
  params: {
    listingId: string;
  };
};

export default function AdminListingEditPage({ params }: AdminListingEditPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title={`Edit listing ${params.listingId}`}
      description="This page is scaffolded for later listing edits, including relist-and-edit flows."
      bullets={[
        "The final form will enforce listing type rules without leaking business logic into the UI.",
        "Money values will remain integer cents throughout.",
        "All listing timestamps will be stored in UTC."
      ]}
    />
  );
}
