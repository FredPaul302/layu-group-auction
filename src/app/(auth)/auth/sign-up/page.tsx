import { PlaceholderPage } from "@/components/placeholder-page";

export default function SignUpPage() {
  return (
    <PlaceholderPage
      eyebrow="Auth"
      title="Register"
      description="This page is reserved for future account creation and initial email verification onboarding."
      bullets={[
        "Email verification is required before bidding or fixed-price claims.",
        "The first post-registration branch will be verification path selection.",
        "No production auth workflow is wired up in this phase."
      ]}
      links={[{ href: "/auth/verify-email", label: "Verify email placeholder" }]}
    />
  );
}
