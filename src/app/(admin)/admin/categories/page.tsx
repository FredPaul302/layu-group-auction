import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createCategoryAction, updateCategoryAction } from "@/lib/catalog/actions";
import { formatBidTierLabel, formatMoney } from "@/lib/catalog/presentation";
import { listAdminCategories, readStatusQueryParam } from "@/lib/catalog/service";

type AdminCategoriesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div className={tone === "error" ? "notice notice-danger" : "notice notice-success"}>
      {message}
    </div>
  );
}

export default async function AdminCategoriesPage({
  searchParams
}: AdminCategoriesPageProps) {
  const resolvedSearchParamsPromise =
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>);
  const [categories, resolvedSearchParams] = await Promise.all([
    listAdminCategories(),
    resolvedSearchParamsPromise
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Categories control listing access tiers and minimum auction thresholds. These settings
            are part of the domain model, not a presentation-only concern.
          </p>
        }
        eyebrow="Admin"
        meta={
          <div className="metric-card">
            <span className="meta-label">Configured categories</span>
            <span className="meta-value tabular-data">{categories.length}</span>
          </div>
        }
        title="Category management"
      />

      {status === "category_saved" ? (
        <Feedback message="Category saved." tone="success" />
      ) : null}
      {status === "category_updated" ? (
        <Feedback message="Category updated." tone="success" />
      ) : null}
      {error ? (
        <Feedback
          message={`Category changes could not be saved (${error.replaceAll("_", " ")}).`}
          tone="error"
        />
      ) : null}

      <section className="surface-card fade-in space-y-4 p-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-950">Create category</h3>
          <p className="text-sm text-zinc-600">
            Required tier choices stay limited to the manual deposit tiers used in V1.
          </p>
        </div>

        <form action={createCategoryAction} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Name</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="name" required />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Slug</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="slug" />
          </label>

          <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
            <span className="font-medium text-zinc-900">Description</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
              name="description"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Minimum start bid cents</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={500}
              min={0}
              name="minimumStartBidCents"
              required
              step={1}
              type="number"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Minimum bid increment cents</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={100}
              min={1}
              name="minimumBidIncrementCents"
              required
              step={1}
              type="number"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Required bid tier</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue="tier_5"
              name="requiredBidTier"
            >
              <option value="tier_5">$5 tier</option>
              <option value="tier_10">$10 tier</option>
              <option value="tier_20">$20 tier</option>
            </select>
          </label>

          <div className="md:col-span-2">
            <button
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              type="submit"
            >
              Save category
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-950">Existing categories</h3>
          <p className="text-sm text-zinc-600">
            Tier requirements and minimum thresholds are visible here so they stay easy to audit.
          </p>
        </div>

        <div className="space-y-4">
          {categories.map((category) => (
            <form
              key={category.id}
              action={updateCategoryAction.bind(null, category.id)}
              className="surface-card fade-in grid gap-4 p-5 md:grid-cols-2"
            >
              <div className="space-y-1 md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={formatBidTierLabel(category.requiredBidTier)}
                    status={category.requiredBidTier}
                  />
                </div>
                <h4 className="pt-2 text-lg font-semibold text-zinc-950">{category.name}</h4>
                <p className="text-sm text-zinc-600">
                  {formatBidTierLabel(category.requiredBidTier)} | minimum start bid{" "}
                  {formatMoney(category.minimumStartBidCents)} | increment{" "}
                  {formatMoney(category.minimumBidIncrementCents)}
                </p>
              </div>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Name</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.name}
                  name="name"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Slug</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.slug}
                  name="slug"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
                <span className="font-medium text-zinc-900">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.description ?? ""}
                  name="description"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Minimum start bid cents</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.minimumStartBidCents}
                  min={0}
                  name="minimumStartBidCents"
                  required
                  step={1}
                  type="number"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Minimum bid increment cents</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.minimumBidIncrementCents}
                  min={1}
                  name="minimumBidIncrementCents"
                  required
                  step={1}
                  type="number"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Required bid tier</span>
                <select
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={category.requiredBidTier}
                  name="requiredBidTier"
                >
                  <option value="tier_5">$5 tier</option>
                  <option value="tier_10">$10 tier</option>
                  <option value="tier_20">$20 tier</option>
                </select>
              </label>

              <div className="md:col-span-2">
                <button
                  className="button-secondary px-4 py-2 text-sm font-medium"
                  type="submit"
                >
                  Update category
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
