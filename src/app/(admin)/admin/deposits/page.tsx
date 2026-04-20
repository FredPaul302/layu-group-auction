import { getAdminDepositReviewSnapshot } from "@/lib/verification/service";

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

export default async function AdminDepositsPage() {
  const deposits = await getAdminDepositReviewSnapshot();
  const pendingReview = deposits.filter((deposit) => deposit.status === "pending_review");
  const reviewed = deposits.filter((deposit) => deposit.status !== "pending_review");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Deposits</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          This queue is for manual deposit review only. No deposit is auto-approved.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-950">Pending review</h3>
        {pendingReview.length === 0 ? (
          <p className="rounded-md border border-zinc-200 p-6 text-sm text-zinc-600">
            No deposits are waiting for review right now.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingReview.map((deposit) => (
              <article key={deposit.id} className="space-y-4 rounded-md border border-zinc-200 p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">{deposit.user.email}</p>
                    <p>
                      {formatMoney(deposit.amountCents)} via {deposit.sitePaymentMethod.displayName}
                    </p>
                    <p>Reference code: {deposit.referenceCode}</p>
                    <p>Payer handle: {deposit.payerHandle ?? "Not provided"}</p>
                    <p>Payment reference: {deposit.externalReference ?? "Not provided"}</p>
                    {deposit.proofAssetUrl ? (
                      <p>
                        Proof:{" "}
                        <a
                          className="text-emerald-700 hover:text-emerald-800"
                          href={deposit.proofAssetUrl}
                        >
                          View screenshot
                        </a>
                      </p>
                    ) : (
                      <p>No screenshot attached.</p>
                    )}
                  </div>

                  <form
                    action={`/api/verifications/deposit/${deposit.id}/review`}
                    className="space-y-3"
                    method="post"
                  >
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-zinc-900">Review notes</span>
                      <textarea
                        className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                        name="reviewNotes"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                        name="decision"
                        type="submit"
                        value="approve"
                      >
                        Approve
                      </button>
                      <button
                        className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 hover:border-rose-400"
                        name="decision"
                        type="submit"
                        value="reject"
                      >
                        Reject
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-950">Reviewed deposits</h3>
        {reviewed.length === 0 ? (
          <p className="rounded-md border border-zinc-200 p-6 text-sm text-zinc-600">
            No reviewed deposits yet.
          </p>
        ) : (
          <div className="space-y-4">
            {reviewed.map((deposit) => (
              <article key={deposit.id} className="space-y-4 rounded-md border border-zinc-200 p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">{deposit.user.email}</p>
                    <p>
                      {formatMoney(deposit.amountCents)} via {deposit.sitePaymentMethod.displayName}
                    </p>
                    <p>Status: {deposit.status}</p>
                    <p>Reference code: {deposit.referenceCode}</p>
                    <p>Reviewed by: {deposit.reviewedByUser?.displayName ?? deposit.reviewedByUser?.email ?? "Not recorded"}</p>
                    {deposit.reviewNotes ? <p>Notes: {deposit.reviewNotes}</p> : null}
                  </div>

                  {deposit.status === "approved" ? (
                    <form
                      action={`/api/verifications/deposit/${deposit.id}/review`}
                      className="space-y-3"
                      method="post"
                    >
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-900">Post-approval notes</span>
                        <textarea
                          className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                          name="reviewNotes"
                        />
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400"
                          name="decision"
                          type="submit"
                          value="refund"
                        >
                          Refund
                        </button>
                        <button
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400"
                          name="decision"
                          type="submit"
                          value="forfeit"
                        >
                          Forfeit
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-sm text-zinc-600">No further manual action is available for this deposit state.</div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
