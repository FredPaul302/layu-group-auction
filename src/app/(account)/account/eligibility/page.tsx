import { PlaceholderPage } from "@/components/placeholder-page";

export default function EligibilityPage() {
  return (
    <PlaceholderPage
      eyebrow="Account"
      title="Eligibility status"
      description="This route will summarize the user’s verification path, approved deposit tier if any, and access to category-restricted listings."
      bullets={[
        "Eligibility calculations will live in domain services, not in the page itself.",
        "Approved hosted identity verification will bypass deposit tier limits in V1.",
        "Category requirements are already reflected in the planned schema."
      ]}
    />
  );
}
