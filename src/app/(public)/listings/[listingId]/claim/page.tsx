import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { canParticipateInCommerce, hasVerifiedEmail } from "@/lib/permissions";

type ClaimPageProps = {
  params: Promise<{
    listingId: string;
  }>;
};

export default async function ListingClaimPage({ params }: ClaimPageProps) {
  const { listingId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/auth/login?next=/listings/${listingId}/claim`);
  }

  if (!hasVerifiedEmail(user)) {
    redirect("/auth/verify-email?status=required");
  }

  if (!canParticipateInCommerce(user)) {
    redirect("/account/verification?notice=secondary_required");
  }

  redirect(`/listings/${listingId}`);
}
