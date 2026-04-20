import { PlaceholderPage } from "@/components/placeholder-page";

export default function HelpVerificationPage() {
  return (
    <PlaceholderPage
      eyebrow="Help"
      title="Verification overview"
      description="This route will explain the V1 verification model: email verification first, then either Persona or refundable deposit verification."
      bullets={[
        "Deposit tiers are modeled as $5, $10, and $20 equivalents in cents.",
        "Category access will depend on the approved deposit tier where required.",
        "Raw Persona document images are explicitly out of bounds for app storage."
      ]}
      links={[
        { href: "/account/verification", label: "Go to verification choice" },
        { href: "/auth/verify-email", label: "Verify email placeholder" }
      ]}
    />
  );
}
