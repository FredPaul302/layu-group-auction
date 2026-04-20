import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminPickupEventsPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Pickup events"
      description="This page is reserved for creating and managing pickup events used for batch handoff of paid items."
      bullets={[
        "Pickup events are a first-class V1 fulfillment concept.",
        "Later work will assign eligible items to specific event windows.",
        "Fulfillment state transitions will stay in the domain layer."
      ]}
      links={[{ href: "/admin/pickup-events/new", label: "Create pickup event" }]}
    />
  );
}
