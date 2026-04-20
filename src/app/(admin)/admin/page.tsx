import { PlaceholderPage } from "@/components/placeholder-page";

export default function AdminDashboardPage() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Admin dashboard"
      description="This route is the future operational home for listings, payments, verification review, offers, and enforcement workflows."
      bullets={[
        "Manual admin workflows are central to the V1 product shape.",
        "The app skeleton already includes matching API placeholders and job scripts.",
        "Permissions will be enforced centrally once auth is added."
      ]}
      links={[
        { href: "/admin/listings", label: "Listings" },
        { href: "/admin/orders", label: "Orders" },
        { href: "/admin/deposits", label: "Deposits" }
      ]}
    />
  );
}
