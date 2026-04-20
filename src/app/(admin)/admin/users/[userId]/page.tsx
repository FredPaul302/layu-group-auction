import { getAdminBidderVerificationDetail } from "@/lib/verification/service";

type AdminUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

export default async function AdminUserDetailPage({
  params,
  searchParams
}: AdminUserDetailPageProps) {
  const { userId } = await params;
  const [bidder, resolvedSearchParams] = await Promise.all([
    getAdminBidderVerificationDetail(userId),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : null;
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">
          Bidder {bidder.displayName ?? bidder.email}
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Verification detail stays separate from payment review and remains fully manual where
          required.
        </p>
      </section>

      {status ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {status.replaceAll("_", " ")}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.replaceAll("_", " ")}
        </p>
      ) : null}

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
            <div>
              <dt className="font-medium text-zinc-900">Non-paying flags</dt>
              <dd>{bidder.bidderProfile?.nonPaymentStrikeCount ?? 0}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Bidder flags</h3>
          <div className="space-y-3 text-sm text-zinc-700">
            <form action={`/api/admin/users/${bidder.id}/block`} className="space-y-2" method="post">
              <input name="action" type="hidden" value="block" />
              <label className="block space-y-1">
                <span className="font-medium text-zinc-900">Block reason</span>
                <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="reason" />
              </label>
              <button className="rounded-md border border-zinc-300 px-3 py-2" type="submit">
                Block bidder
              </button>
            </form>

            <form action={`/api/admin/users/${bidder.id}/block`} className="space-y-2" method="post">
              <input name="action" type="hidden" value="mark_non_paying" />
              <label className="block space-y-1">
                <span className="font-medium text-zinc-900">Non-paying reason</span>
                <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="reason" />
              </label>
              <button className="rounded-md border border-zinc-300 px-3 py-2" type="submit">
                Mark non-paying
              </button>
            </form>

            <div className="flex flex-wrap gap-3">
              <form action={`/api/admin/users/${bidder.id}/block`} method="post">
                <input name="action" type="hidden" value="clear_block" />
                <button className="rounded-md border border-zinc-300 px-3 py-2" type="submit">
                  Clear block
                </button>
              </form>
              <form action={`/api/admin/users/${bidder.id}/block`} method="post">
                <input name="action" type="hidden" value="clear_non_paying" />
                <button className="rounded-md border border-zinc-300 px-3 py-2" type="submit">
                  Clear non-paying
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-zinc-200 p-6">
        <h3 className="text-lg font-semibold text-zinc-950">Active and historical flags</h3>
        {bidder.bidderProfile?.flags.length ? (
          <ul className="space-y-3 text-sm text-zinc-700">
            {bidder.bidderProfile.flags.map((flag) => (
              <li key={flag.id} className="rounded-md border border-zinc-200 p-4">
                <p className="font-medium text-zinc-900">
                  {flag.flagType} · {flag.isActive ? "active" : "cleared"}
                </p>
                <p>{flag.reason}</p>
                <p>
                  Created by {flag.createdByUser?.displayName ?? flag.createdByUser?.email ?? "system"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No bidder flags yet.</p>
        )}
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
