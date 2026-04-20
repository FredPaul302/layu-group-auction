import { getAdminBidderVerificationDetail } from "@/lib/verification/service";

type AdminUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { userId } = await params;
  const bidder = await getAdminBidderVerificationDetail(userId);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">
          Bidder {bidder.displayName ?? bidder.email}
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Verification detail stays separate from payment review and remains fully manual where required.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Eligibility snapshot</h3>
          <dl className="space-y-3 text-sm text-zinc-700">
            <div>
              <dt className="font-medium text-zinc-900">Email</dt>
              <dd>{bidder.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Email verified</dt>
              <dd>{bidder.emailVerifiedAtUtc ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Derived source</dt>
              <dd>{bidder.derivedEligibility.source}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Derived max tier</dt>
              <dd>{bidder.derivedEligibility.maxBidTier}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Active approved deposit hold</dt>
              <dd>{formatMoney(bidder.activeApprovedDepositAmountCents)}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Blocked</dt>
              <dd>{bidder.bidderProfile?.isBlocked ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Latest Persona verification</h3>
          {bidder.latestPersonaVerification ? (
            <dl className="space-y-3 text-sm text-zinc-700">
              <div>
                <dt className="font-medium text-zinc-900">Status</dt>
                <dd>{bidder.latestPersonaVerification.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Inquiry ID</dt>
                <dd>{bidder.latestPersonaVerification.inquiryId ?? "Not assigned"}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Reference ID</dt>
                <dd>{bidder.latestPersonaVerification.referenceId ?? "Not assigned"}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-900">Decision summary</dt>
                <dd>{bidder.latestPersonaVerification.decisionSummary ?? "Not recorded"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-600">No Persona verification record yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
        <h3 className="text-lg font-semibold text-zinc-950">Deposit history</h3>
        {bidder.deposits.length === 0 ? (
          <p className="text-sm text-zinc-600">No deposits submitted.</p>
        ) : (
          <ul className="space-y-3 text-sm text-zinc-700">
            {bidder.deposits.map((deposit) => (
              <li key={deposit.id} className="rounded-md border border-zinc-200 p-4">
                <p className="font-medium text-zinc-900">
                  {formatMoney(deposit.amountCents)} via {deposit.sitePaymentMethod.displayName}
                </p>
                <p>Status: {deposit.status}</p>
                <p>Reference code: {deposit.referenceCode}</p>
                <p>Payer handle: {deposit.payerHandle ?? "Not provided"}</p>
                <p>Payment reference: {deposit.externalReference ?? "Not provided"}</p>
                {deposit.proofAssetUrl ? (
                  <p>
                    Proof:{" "}
                    <a className="text-emerald-700 hover:text-emerald-800" href={deposit.proofAssetUrl}>
                      View screenshot
                    </a>
                  </p>
                ) : null}
                {deposit.reviewNotes ? <p>Notes: {deposit.reviewNotes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
