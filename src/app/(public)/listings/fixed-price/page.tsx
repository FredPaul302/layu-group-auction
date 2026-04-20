import { PlaceholderPage } from "@/components/placeholder-page";

export default function FixedPriceListingsPage() {
  return (
    <PlaceholderPage
      eyebrow="Listings"
      title="Fixed-price listings"
      description="This route is reserved for listings that use the same verification and external payment flow as auctions, without the bidding timeline."
      bullets={[
        "Claim handling is not implemented yet.",
        "Verification and manual payment confirmation will match the auction flow.",
        "Shipping and pickup mode display will be shared with the listing detail page."
      ]}
      links={[
        { href: "/listings/demo-fixed-price-item", label: "Open a placeholder listing detail" },
        { href: "/help/payments", label: "View payment instructions placeholder" }
      ]}
    />
  );
}
