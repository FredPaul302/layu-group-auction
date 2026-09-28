import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";
import { describeVerificationPolicy } from "@/lib/verification/policy";
import { getVerificationPolicy } from "@/lib/verification/policy-service";

export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  await requireAdminUser();
  const policy = await getVerificationPolicy();
  return <div className="space-y-8">
    <PageHeader eyebrow="Admin" title="Buyer verification" description={<p>{describeVerificationPolicy(policy)}</p>} />
    <section className="surface-card flex flex-wrap gap-4 p-6">
      <Link href="/admin/settings/verification" className="button-primary px-4 py-2 text-sm font-medium">Change verification level</Link>
      <Link href="/admin/deposits" className="button-secondary px-4 py-2 text-sm font-medium">Review deposits</Link>
      <Link href="/admin/bidders" className="button-secondary px-4 py-2 text-sm font-medium">View and block buyers</Link>
    </section>
  </div>;
}
