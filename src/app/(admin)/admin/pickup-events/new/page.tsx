import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminPickupEventsNewPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Create pickup event"
      description="This placeholder will become the pickup-event creation form in a later phase."
      bullets={[
        "Pickup events will store location, instructions, and UTC start/end timestamps.",
        "Multiple fulfilled orders may later be linked to one event.",
        "No operational scheduling logic is implemented yet."
      ]}
    />
  );
}
