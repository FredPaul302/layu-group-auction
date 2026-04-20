import { PlaceholderPage } from "@/components/placeholder-page";

export default function LiveAuctionsPage() {
  return (
    <PlaceholderPage
      eyebrow="Listings"
      title="Live auctions"
      description="This placeholder will become the active auction index for published listings that start immediately and close at a fixed UTC timestamp."
      bullets={[
        "No scheduled future auction start UI will be exposed in V1.",
        "Auction eligibility and tier limits will be enforced by domain services rather than page-level conditionals.",
        "Sorting, search, and countdown behavior will be added in later phases."
      ]}
      links={[
        { href: "/listings/fixed-price", label: "See fixed-price listings" },
        { href: "/help/verification", label: "Review verification rules" }
      ]}
    />
  );
}
