import { PlaceholderPage } from "@/components/placeholder-page";

export default function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="Home"
      title="Auction platform scaffold"
      description="This is the starting point for the single-seller marketplace. The project now has the routing, Prisma, job scripts, and adapter interfaces in place without implementing live marketplace behavior yet."
      bullets={[
        "Auctions and fixed-price listings remain placeholders in this phase.",
        "Verification and payment flows are modeled for later manual-review implementation.",
        "Background jobs for auction closing, overdue payment expiry, and offer expiry are scaffolded as idempotent stubs."
      ]}
      links={[
        { href: "/listings", label: "Browse listings scaffold" },
        { href: "/account", label: "Open account dashboard" },
        { href: "/admin", label: "Open admin dashboard" }
      ]}
    />
  );
}
