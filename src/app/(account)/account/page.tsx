import { PlaceholderPage } from "@/components/placeholder-page";

export default function AccountDashboardPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Account dashboard"
      description="This route will become the main status view for bids, purchases, offers, verification, payment deadlines, and fulfillment."
      bullets={[
        "Account-specific data remains stubbed.",
        "The page structure is ready for later session-based access control.",
        "Verification and payment review states will be surfaced here once models are wired up."
      ]}
      links={[
        { href: "/account/verification", label: "Verification" },
        { href: "/account/purchases", label: "Purchases" },
        { href: "/account/offers", label: "Runner-up offers" }
      ]}
    />
  );
}
