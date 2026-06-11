import { CategoryForm } from "@/components/admin/category-form";
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

function getCategoryErrorMessage(error: string) {
  switch (error) {
    case "duplicate_slug":
      return "That category slug is already in use. Choose a different slug or regenerate from the name.";
    case "duplicate_value":
      return "That category value is already in use. Check the slug and try again.";
    case "slug_required":
      return "Category slug could not be generated. Enter a name or slug and try again.";
    default:
      return `Category changes could not be saved (${error.replaceAll("_", " ")}).`;
  }
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
          message={getCategoryErrorMessage(error)}
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

        <CategoryForm action={createCategoryAction} submitLabel="Save category" />
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
            <div
              key={category.id}
              className="surface-card fade-in space-y-4 p-5"
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

              <CategoryForm
                action={updateCategoryAction.bind(null, category.id)}
                category={category}
                submitLabel="Update category"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
