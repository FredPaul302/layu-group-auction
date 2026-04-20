import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminBiddersPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Bidders"
      description="This scaffold route will later show bidder statuses, verification state, and enforcement actions."
      bullets={[
        "The current route complements the route-map user detail page for quick filtering.",
        "Eligibility and blocking will be sourced from shared domain modules.",
        "No user management business logic is implemented here yet."
      ]}
      links={[{ href: "/admin/users/demo-user", label: "Open bidder detail placeholder" }]}
    />
  );
}
