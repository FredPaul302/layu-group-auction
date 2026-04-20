import Link from "next/link";
import { redirect } from "next/navigation";

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
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
        <h2 className="text-3xl font-semibold text-zinc-950">Deposit verification</h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Choose a refundable tier, send the payment manually, and submit your details for manual
          admin review.
        </p>
      </section>

      {status && statusMessages[status] ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessages[status]}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6 rounded-md border border-zinc-200 p-6">
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
                  className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                  type="submit"
                >
                  Generate reference
                </button>
              </div>
            </form>
          </div>

          {verificationOverview.activeDraftDeposit ? (
            <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-5">
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
                  className="inline-flex w-fit rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                  type="submit"
                >
                  Submit for review
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Recent deposit activity</h3>
          {verificationOverview.deposits.length === 0 ? (
            <p className="text-sm text-zinc-600">No deposit verification attempts yet.</p>
          ) : (
            <ul className="space-y-3 text-sm text-zinc-700">
              {verificationOverview.deposits.slice(0, 6).map((deposit) => (
                <li key={deposit.id} className="rounded-md border border-zinc-200 p-3">
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
