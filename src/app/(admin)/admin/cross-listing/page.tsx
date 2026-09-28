import Link from "next/link";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCrossListings } from "@/lib/cross-listing/service";
import { CrossListingWorkspace } from "@/components/admin/cross-listing-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default async function CrossListingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminUser();
  const params = await searchParams;
  const initialIds = typeof params.items === "string" ? [...new Set(params.items.split(",").filter((id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, 100) : [];
  const query = typeof params.q === "string" ? params.q.slice(0, 200).trim() : "";
  const attention = params.attention === "1";
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(params.page ?? "1"), 10) || 1));
  const listingPage = Math.max(1, Math.min(100000, Number.parseInt(String(params.listingPage ?? "1"), 10) || 1));
  const where = { sellerUserId: admin.id, ...(initialIds.length ? { id: { in: initialIds } } : { status: { in: ["draft", "published"] as ("draft" | "published")[] } }), ...(query ? { title: { contains: query, mode: "insensitive" as const } } : {}) };
  const [listings, listingCount, queue] = await Promise.all([
    prisma.listing.findMany({ where, select: { id: true, title: true, listingType: true, status: true }, orderBy: [{ updatedAtUtc: "desc" }, { id: "asc" }], skip: (listingPage - 1) * 100, take: 100 }),
    prisma.listing.count({ where }), listCrossListings(admin.id, page, initialIds, attention),
  ]);
  function pageUrl(nextPage: number, nextListingPage = listingPage) {
    return `/admin/cross-listing?${new URLSearchParams({ page: String(nextPage), listingPage: String(nextListingPage), ...(attention ? { attention: "1" } : {}), ...(query ? { q: query } : {}), ...(initialIds.length ? { items: initialIds.join(",") } : {}) })}`;
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="Admin" title="List elsewhere" description={<p>Prepare a batch once, review each destination, and track where your items are posted. Work is saved between visits.</p>} actions={<Link href="/admin/connections" className="button-secondary px-4 py-2">Set up accounts & connections</Link>} />
    <p className="notice notice-info">Auction bids stay on Layu Market. External sales and stock are not synchronized yet; review the removal tasks here whenever an item sells.</p>
    <div className="flex gap-4"><Link className="underline" href="/admin/cross-listing">All prepared records</Link><Link className="underline" href="/admin/cross-listing?attention=1">Offers and promotions needing removal or update</Link>{attention ? <strong>Showing removal tasks</strong> : null}</div>
    <form method="get" className="flex flex-wrap gap-3"><input name="q" defaultValue={query} placeholder="Find listings by title" className="rounded border border-zinc-300 px-3 py-2" aria-label="Find listings by title" /><button className="button-secondary px-4 py-2">Find listings</button>{initialIds.length ? <Link className="button-ghost px-4 py-2" href="/admin/cross-listing">Show all listings</Link> : null}</form>
    <div className="flex flex-wrap gap-4 text-sm"><span>{listingCount} matching Layu listings · selection page {listingPage}</span>{listingPage > 1 ? <Link className="underline" href={pageUrl(page, listingPage - 1)}>Previous items</Link> : null}{listingPage * 100 < listingCount ? <Link className="underline" href={pageUrl(page, listingPage + 1)}>Next items</Link> : null}</div>
    <CrossListingWorkspace key={`${page}:${listingPage}:${query}:${initialIds.join(",")}`} listings={listings} rows={queue.rows} initialIds={initialIds.filter((id) => listings.some((listing) => listing.id === id))} />
    <nav aria-label="Prepared destination pages" className="flex flex-wrap gap-4"><span>{queue.total} prepared destination records · page {page}</span>{page > 1 ? <Link className="underline" href={pageUrl(page - 1)}>Previous records</Link> : null}{page * 100 < queue.total ? <Link className="underline" href={pageUrl(page + 1)}>Next records</Link> : null}</nav>
  </div>;
}
