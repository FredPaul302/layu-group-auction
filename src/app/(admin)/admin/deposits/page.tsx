import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminDepositReviewSnapshot } from "@/lib/verification/service";

type AdminDepositsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const statusMessages: Record<string, string> = {
  deposit_reviewed: "Deposit review updated successfully."
};

const errorMessages: Record<string, string> = {
  deposit_review_invalid: "That deposit review action is no longer valid.",
  deposit_submission_not_found: "The deposit record could not be found."
};

export default async function AdminDepositsPage({ searchParams }: AdminDepositsPageProps) {
  const [deposits, resolvedSearchParams] = await Promise.all([
    getAdminDepositReviewSnapshot(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  const status = readValue(resolvedSearchParams.status);
  const error = readValue(resolvedSearchParams.error);
  const pendingReview = deposits.filter((deposit) => deposit.status === "pending_review");
  const reviewed = deposits.filter((deposit) => deposit.status !== "pending_review");

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>This queue is for manual deposit review only. No deposit is auto-approved.</p>
        }
        eyebrow="Admin"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Pending review</span>
              <span className="meta-value tabular-data">{pendingReview.length}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Reviewed deposits</span>
              <span className="meta-value tabular-data">{reviewed.length}</span>
            </div>
          </>
        }
        title="Deposits"
      />

      {status && statusMessages[status] ? (
        <p className="notice notice-success">{statusMessages[status]}</p>
      ) : null}
      {error && errorMessages[error] ? (
        <p className="notice notice-danger">{errorMessages[error]}</p>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-950">Pending review</h3>
        {pendingReview.length === 0 ? (
          <EmptyState
            description="No deposits are waiting for review right now."
            title="Queue is clear"
          />
        ) : (
          <div className="space-y-4">
            {pendingReview.map((deposit) => (
              <article key={deposit.id} className="surface-card queue-card motion-panel space-y-4 p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 text-sm text-zinc-700">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={deposit.status} />
                    </div>
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
                        className="button-primary px-4 py-2 text-sm font-medium"
                        name="decision"
                        type="submit"
                        value="approve"
                      >
                        Approve
                      </button>
                      <button
                        className="button-secondary px-4 py-2 text-sm font-medium text-rose-900"
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
          <EmptyState description="No reviewed deposits yet." title="No completed reviews yet" />
        ) : (
          <div className="space-y-4">
            {reviewed.map((deposit) => (
              <article key={deposit.id} className="surface-card queue-card motion-panel space-y-4 p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 text-sm text-zinc-700">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={deposit.status} />
                    </div>
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
                          className="button-secondary px-4 py-2 text-sm font-medium"
                          name="decision"
                          type="submit"
                          value="refund"
                        >
                          Refund
                        </button>
                        <button
                          className="button-secondary px-4 py-2 text-sm font-medium"
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
