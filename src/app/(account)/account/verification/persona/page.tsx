import { PlaceholderPage } from "@/components/placeholder-page";

export default function PersonaVerificationPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Persona verification"
      description="This route is reserved for the Persona identity verification handoff and return experience."
      bullets={[
        "The app will store only minimal Persona reference data and statuses.",
        "Raw Persona document images must not be stored in the application database.",
        "Approved users will gain full bidding eligibility in V1."
      ]}
    />
  );
}
