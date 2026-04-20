import { PlaceholderPage } from "@/components/placeholder-page";

export default function SignInPage() {
  return (
    <PlaceholderPage
      eyebrow="Auth"
      title="Sign in"
      description="Authentication is not implemented yet, but the route is reserved so the scaffold matches the planned account and admin flows."
      bullets={[
        "Final auth library selection remains open, though NEXTAUTH_SECRET is already reserved in the environment file.",
        "Sessions and permissions will be layered in before protected workflows go live.",
        "The route exists now so navigation and future middleware have a stable home."
      ]}
      links={[{ href: "/auth/sign-up", label: "Register placeholder" }]}
    />
  );
}
