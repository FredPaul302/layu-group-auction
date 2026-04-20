import { notFound } from "next/navigation";

import { ListingCard } from "@/components/catalog/listing-card";
import { formatBidTierLabel, formatMoney } from "@/lib/catalog/presentation";
import { getPublicCategoryBySlug, listPublicListings } from "@/lib/catalog/service";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const [category, listings] = await Promise.all([
    getPublicCategoryBySlug(slug).catch(() => notFound()),
    listPublicListings({
      categorySlug: slug
    })
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Category</p>
        <h2 className="text-3xl font-semibold text-zinc-950">{category.name}</h2>
        <p className="max-w-3xl text-base text-zinc-600">
          {category.description ?? "No category description yet."}
        </p>

        <dl className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-200 p-4">
            <dt className="text-zinc-500">Required tier</dt>
            <dd className="mt-1 font-medium text-zinc-950">
              {formatBidTierLabel(category.requiredBidTier)}
            </dd>
          </div>
          <div className="rounded-md border border-zinc-200 p-4">
            <dt className="text-zinc-500">Minimum start bid</dt>
            <dd className="mt-1 font-medium text-zinc-950">
              {formatMoney(category.minimumStartBidCents)}
            </dd>
          </div>
          <div className="rounded-md border border-zinc-200 p-4">
            <dt className="text-zinc-500">Minimum increment</dt>
            <dd className="mt-1 font-medium text-zinc-950">
              {formatMoney(category.minimumBidIncrementCents)}
            </dd>
          </div>
        </dl>
      </section>

      {listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          No published listings are assigned to this category yet.
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </section>
      )}
    </div>
  );
}
