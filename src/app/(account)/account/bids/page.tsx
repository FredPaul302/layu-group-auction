import { PlaceholderPage } from "@/components/placeholder-page";

export default function AccountBidsPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="My bids"
      description="This placeholder is reserved for active bids, outbid notices, and closed-auction results once bidding is implemented."
      bullets={[
        "Proxy bidding is explicitly out of scope for V1.",
        "Auction outcomes will be driven by the highest valid bid at close time.",
        "Last-second bidding behavior will not extend the timer in this version."
      ]}
    />
  );
}
