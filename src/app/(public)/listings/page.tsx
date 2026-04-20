import { PlaceholderPage } from "@/components/placeholder-page";

export default function ListingsPage() {
  return (
    <PlaceholderPage
      eyebrow="Listings"
      title="Marketplace browse scaffold"
      description="This route stands in for the shared browse and search surface that will later split listing cards by type, category rules, and live status."
      bullets={[
        "Future work will load active auction and fixed-price records from the database.",
        "Category access and bidder eligibility checks are intentionally deferred.",
        "The route exists now so the App Router layout mirrors the planned information architecture."
      ]}
      links={[
        { href: "/listings/auctions", label: "Live auctions" },
        { href: "/listings/fixed-price", label: "Fixed-price listings" }
      ]}
    />
  );
}
