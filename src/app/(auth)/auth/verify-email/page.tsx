import { PlaceholderPage } from "@/components/placeholder-page";

export default function VerifyEmailPage() {
  return (
    <PlaceholderPage
      eyebrow="Auth"
      title="Verify email"
      description="This placeholder route exists for the required first step in the buyer and bidder verification flow."
      bullets={[
        "Email verification precedes Persona and deposit verification.",
        "Later work will connect this page to SMTP delivery and tokenized callbacks.",
        "No bidding or claiming should be allowed before this step is complete."
      ]}
      links={[{ href: "/account/verification", label: "Verification choice placeholder" }]}
    />
  );
}
