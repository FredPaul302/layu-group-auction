import { PlaceholderPage } from "@/components/placeholder-page";

type AdminUserDetailPageProps = {
  params: {
    userId: string;
  };
};

export default function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title={`Bidder ${params.userId}`}
      description="This route will later support blocking, non-paying bidder actions, and administrative notes tied to a user account."
      bullets={[
        "Blocking remains a manual admin action in V1.",
        "Audit logging is part of the planned schema.",
        "The route is scaffolded even though enforcement logic is not wired up yet."
      ]}
    />
  );
}
