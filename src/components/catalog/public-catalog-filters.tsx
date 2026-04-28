import Link from "next/link";

import {
  type PublicCatalogQuery,
  publicCatalogSortOptions,
  publicCatalogStatusOptions,
  publicCatalogTypeOptions
} from "@/lib/catalog/public-discovery";

type PublicCatalogFiltersProps = {
  actionPath: string;
  query: PublicCatalogQuery;
  resultCount: number;
  showTypeFilter?: boolean;
  showStatusFilter?: boolean;
  searchPlaceholder?: string;
};

export function PublicCatalogFilters({
  actionPath,
  query,
  resultCount,
  showTypeFilter = true,
  showStatusFilter = true,
  searchPlaceholder = "Search by title or category"
}: PublicCatalogFiltersProps) {
  return (
    <form
      action={actionPath}
      className="surface-card grid gap-4 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(11rem,0.7fr)_minmax(11rem,0.7fr)_minmax(11rem,0.7fr)_auto]"
      method="get"
    >
      <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
        <span className="font-medium text-zinc-900">Search</span>
        <input
          defaultValue={query.q}
          name="q"
          placeholder={searchPlaceholder}
          type="search"
        />
      </label>

      {showTypeFilter ? (
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Type</span>
          <select defaultValue={query.type} name="type">
            {publicCatalogTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showStatusFilter ? (
        <label className="space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Status</span>
          <select defaultValue={query.status} name="status">
            {publicCatalogStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Sort</span>
        <select defaultValue={query.sort} name="sort">
          {publicCatalogSortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-3">
        <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
          Apply
        </button>
        <Link className="button-ghost px-0 py-0 text-sm font-medium" href={actionPath}>
          Reset
        </Link>
      </div>

      <div className="md:col-span-full">
        <p className="text-sm text-zinc-600">
          {resultCount} listing{resultCount === 1 ? "" : "s"} in this view.
        </p>
      </div>
    </form>
  );
}
