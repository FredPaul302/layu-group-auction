import { PlaceholderPage } from "@/components/placeholder-page";

export default function VerificationChoicePage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Verification choice"
      description="This page is scaffolded for the point where a user chooses Persona identity verification or manual deposit verification after email verification."
      bullets={[
        "Persona and deposit paths will be modeled separately but converge on shared bidding eligibility rules.",
        "Deposit approval remains manual in V1.",
        "Later work will show approved tier limits and category access here."
      ]}
      links={[
        { href: "/account/verification/persona", label: "Persona verification" },
        { href: "/account/verification/deposit", label: "Deposit verification" }
      ]}
    />
  );
}
