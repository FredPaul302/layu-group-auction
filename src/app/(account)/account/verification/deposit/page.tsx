import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/lib/auth";
import { hasVerifiedEmail } from "@/lib/permissions";
import { getUserVerificationOverview } from "@/lib/verification/service";

type DepositVerificationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  created: "A deposit reference code is ready. Complete the payment and submit your details below.",
  invalid_amount: "Select one of the supported deposit tiers: $5, $10, or $20.",
  invalid_method: "Select an enabled payment method.",
  invalid_screenshot: "Only image screenshots are supported for deposit proof.",
  already_submitted: "That deposit draft was already submitted and is no longer editable.",
  submitted: "Your deposit submission is now waiting for manual admin review.",
  submission_missing: "The selected deposit draft was not found."
};

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

export default async function DepositVerificationPage({
  searchParams
}: DepositVerificationPageProps) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();

  if (!hasVerifiedEmail(user)) {
    redirect("/auth/verify-email?status=required");
  }

  const verificationOverview = await getUserVerificationOverview(user.id);
  const status = readValue(params.status);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Choose a refundable tier, send the payment manually, and submit your details for manual
            admin review.
          </p>
        }
        eyebrow="Account"
        meta={
          <>
            <div className="metric-card">
              <span className="meta-label">Recent attempts</span>
              <span className="meta-value tabular-data">{verificationOverview.deposits.length}</span>
            </div>
            <div className="metric-card">
              <span className="meta-label">Approved source</span>
              <div className="pt-1">
                <StatusBadge
                  label={verificationOverview.derivedEligibility.source}
                  status={
                    verificationOverview.derivedEligibility.source === "deposit"
                      ? "deposit_verified"
                      : "pending_review"
                  }
                />
              </div>
            </div>
          </>
        }
        title="Deposit verification"
      />

      {status && statusMessages[status] ? (
        <p className="notice notice-success">
          {statusMessages[status]}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card fade-in space-y-6 p-6">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-950">Step 1: Choose a deposit tier</h3>
            <form action="/api/verifications/deposit" className="grid gap-4 md:grid-cols-3" method="post">
              <input name="action" type="hidden" value="create_intent" />
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-900">Tier</span>
                <select className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" name="amountCents">
                  <option value="500">$5</option>
                  <option value="1000">$10</option>
                  <option value="2000">$20</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-900">Payment method</span>
                <select className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" name="paymentMethodCode">
                  {verificationOverview.paymentMethods.map((paymentMethod) => (
                    <option key={paymentMethod.id} value={paymentMethod.code}>
                      {paymentMethod.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  className="button-primary px-4 py-2 text-sm font-medium"
                  type="submit"
                >
                  Generate reference
                </button>
              </div>
            </form>
          </div>

          {verificationOverview.activeDraftDeposit ? (
            <div className="surface-elevated space-y-4 p-5">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-zinc-950">Step 2: Pay and submit proof</h3>
                <p className="text-sm text-zinc-700">
                  Send {formatMoney(verificationOverview.activeDraftDeposit.amountCents)} via{" "}
                  {verificationOverview.activeDraftDeposit.sitePaymentMethod.displayName} and include
                  the reference code <span className="font-semibold">{verificationOverview.activeDraftDeposit.referenceCode}</span>.
                </p>
                <p className="text-sm text-zinc-700">
                  Handle:{" "}
                  {verificationOverview.activeDraftDeposit.sitePaymentMethod.handle ?? "Not configured"}
                </p>
                {verificationOverview.activeDraftDeposit.sitePaymentMethod.linkUrl ? (
                  <p className="text-sm text-zinc-700">
                    Link:{" "}
                    <a
                      className="text-emerald-700 hover:text-emerald-800"
                      href={verificationOverview.activeDraftDeposit.sitePaymentMethod.linkUrl}
                    >
                      {verificationOverview.activeDraftDeposit.sitePaymentMethod.linkUrl}
                    </a>
                  </p>
                ) : null}
              </div>

              <form
                action="/api/verifications/deposit"
                className="grid gap-4"
                encType="multipart/form-data"
                method="post"
              >
                <input name="action" type="hidden" value="submit" />
                <input
                  name="depositId"
                  type="hidden"
                  value={verificationOverview.activeDraftDeposit.id}
                />

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-900">Payer handle</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    name="payerHandle"
                    placeholder="@yourhandle"
                    type="text"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-900">Payment app reference or note</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    name="externalReference"
                    placeholder="Transaction ID or note text"
                    type="text"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-900">Optional screenshot</span>
                  <input
                    accept="image/*"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    name="screenshot"
                    type="file"
                  />
                </label>

                <button
                  className="button-primary w-fit px-4 py-2 text-sm font-medium"
                  type="submit"
                >
                  Submit for review
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div className="surface-card fade-in space-y-4 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Recent deposit activity</h3>
          {verificationOverview.deposits.length === 0 ? (
            <EmptyState
              description="No deposit verification attempts yet."
              title="No deposit activity yet"
            />
          ) : (
            <ul className="space-y-3 text-sm text-zinc-700">
              {verificationOverview.deposits.slice(0, 6).map((deposit) => (
                <li key={deposit.id} className="surface-elevated space-y-2 p-3">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={deposit.status} />
                  </div>
                  <p className="font-medium text-zinc-900">
                    {formatMoney(deposit.amountCents)} via {deposit.sitePaymentMethod.displayName}
                  </p>
                  <p>Status: {deposit.status}</p>
                  <p>Reference code: {deposit.referenceCode}</p>
                  {deposit.proofAssetUrl ? (
                    <p>
                      Proof:{" "}
                      <a className="text-emerald-700 hover:text-emerald-800" href={deposit.proofAssetUrl}>
                        View screenshot
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <p className="text-sm text-zinc-600">
            Admin reviews happen in the{" "}
            <Link className="text-emerald-700 hover:text-emerald-800" href="/admin/deposits">
              deposit review queue
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
