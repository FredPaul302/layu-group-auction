import { getCurrentAuctionPriceCents } from "@/lib/auctions";

type SearchParamsValue = string | string[] | undefined;

export type PublicCatalogListingLike = {
  id: string;
  title: string;
  description?: string | null;
  conditionNote?: string | null;
  listingType: "auction" | "fixed_price";
  status: string;
  fixedPriceCents: number | null;
  publishedAtUtc: Date | string | null;
  category: {
    name: string;
    slug: string;
  };
  auction: null | {
    status?: string | null;
    endAtUtc: Date | string;
    startingBidCents: number;
    currentHighestBidCents: number | null;
  };
};

export const publicCatalogTypeOptions = [
  { value: "all", label: "All types" },
  { value: "auction", label: "Auctions" },
  { value: "fixed_price", label: "Fixed price" }
] as const;

export const publicCatalogStatusOptions = [
  { value: "available", label: "Available now" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All public" }
] as const;

export const publicCatalogSortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "ending_soon", label: "Ending soon" },
  { value: "price_low", label: "Price low to high" },
  { value: "price_high", label: "Price high to low" }
] as const;

export type PublicCatalogTypeFilter = (typeof publicCatalogTypeOptions)[number]["value"];
export type PublicCatalogStatusFilter = (typeof publicCatalogStatusOptions)[number]["value"];
export type PublicCatalogSortKey = (typeof publicCatalogSortOptions)[number]["value"];

export type PublicCatalogQuery = {
  q: string;
  type: PublicCatalogTypeFilter;
  status: PublicCatalogStatusFilter;
  sort: PublicCatalogSortKey;
};

export function getFirstSearchParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function isPublicCatalogTypeFilter(value: string): value is PublicCatalogTypeFilter {
  return publicCatalogTypeOptions.some((option) => option.value === value);
}

function isPublicCatalogStatusFilter(value: string): value is PublicCatalogStatusFilter {
  return publicCatalogStatusOptions.some((option) => option.value === value);
}

function isPublicCatalogSortKey(value: string): value is PublicCatalogSortKey {
  return publicCatalogSortOptions.some((option) => option.value === value);
}

export function parsePublicCatalogQuery(
  searchParams: Record<string, SearchParamsValue>,
  defaults?: Partial<PublicCatalogQuery>
): PublicCatalogQuery {
  const q = getFirstSearchParamValue(searchParams.q).trim();
  const typeValue = getFirstSearchParamValue(searchParams.type).trim();
  const statusValue = getFirstSearchParamValue(searchParams.status).trim();
  const sortValue = getFirstSearchParamValue(searchParams.sort).trim();

  return {
    q,
    type: isPublicCatalogTypeFilter(typeValue) ? typeValue : defaults?.type ?? "all",
    status: isPublicCatalogStatusFilter(statusValue)
      ? statusValue
      : defaults?.status ?? "available",
    sort: isPublicCatalogSortKey(sortValue) ? sortValue : defaults?.sort ?? "newest"
  };
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function getPublicListingSearchText(listing: PublicCatalogListingLike) {
  return normalizeSearchText(
    [
      listing.title,
      listing.description ?? "",
      listing.conditionNote ?? "",
      listing.category.name
    ].join(" ")
  );
}

export function getPublicListingDisplayPriceCents(listing: PublicCatalogListingLike) {
  if (listing.listingType === "auction" && listing.auction) {
    return getCurrentAuctionPriceCents({
      startingBidCents: listing.auction.startingBidCents,
      currentHighestBidCents: listing.auction.currentHighestBidCents
    });
  }

  return listing.fixedPriceCents ?? null;
}

export function getPublicListingStatusGroup(listing: PublicCatalogListingLike) {
  if (listing.status === "published") {
    return "available" as const;
  }

  if (listing.status === "sold_pending_payment") {
    return "reserved" as const;
  }

  if (["paid", "ready_for_fulfillment", "fulfilled", "completed"].includes(listing.status)) {
    return "sold" as const;
  }

  return "closed" as const;
}

export function formatPublicListingStatusLabel(listing: PublicCatalogListingLike) {
  const group = getPublicListingStatusGroup(listing);

  if (listing.listingType === "auction" && group === "available" && listing.auction?.status === "live") {
    return "Live auction";
  }

  if (group === "available") {
    return "Available now";
  }

  if (group === "reserved") {
    return "Reserved";
  }

  if (group === "sold") {
    return "Sold";
  }

  return "Closed";
}

export function getPublicListingStatusTone(listing: PublicCatalogListingLike) {
  const group = getPublicListingStatusGroup(listing);

  if (listing.listingType === "auction" && group === "available" && listing.auction?.status === "live") {
    return "live";
  }

  if (group === "available") {
    return "published";
  }

  if (group === "reserved") {
    return "sold_pending_payment";
  }

  if (group === "sold") {
    return "sold";
  }

  return listing.status === "cancelled" ? "cancelled" : "ended";
}

export function filterAndSortPublicListings<TListing extends PublicCatalogListingLike>(
  listings: TListing[],
  query: PublicCatalogQuery
) {
  const searchTerms = query.q
    .split(/\s+/u)
    .map((term) => normalizeSearchText(term))
    .filter(Boolean);

  const filteredListings = listings.filter((listing) => {
    if (query.type !== "all" && listing.listingType !== query.type) {
      return false;
    }

    if (query.status !== "all" && getPublicListingStatusGroup(listing) !== query.status) {
      return false;
    }

    if (searchTerms.length === 0) {
      return true;
    }

    const searchText = getPublicListingSearchText(listing);

    return searchTerms.every((term) => searchText.includes(term));
  });

  return [...filteredListings].sort((left, right) => {
    if (query.sort === "ending_soon") {
      const leftDeadline = left.auction
        ? new Date(left.auction.endAtUtc).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightDeadline = right.auction
        ? new Date(right.auction.endAtUtc).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (leftDeadline !== rightDeadline) {
        return leftDeadline - rightDeadline;
      }
    }

    if (query.sort === "price_low" || query.sort === "price_high") {
      const leftPrice = getPublicListingDisplayPriceCents(left) ?? Number.MAX_SAFE_INTEGER;
      const rightPrice = getPublicListingDisplayPriceCents(right) ?? Number.MAX_SAFE_INTEGER;

      if (leftPrice !== rightPrice) {
        return query.sort === "price_low" ? leftPrice - rightPrice : rightPrice - leftPrice;
      }
    }

    const leftPublished = left.publishedAtUtc ? new Date(left.publishedAtUtc).getTime() : 0;
    const rightPublished = right.publishedAtUtc ? new Date(right.publishedAtUtc).getTime() : 0;

    if (leftPublished !== rightPublished) {
      return rightPublished - leftPublished;
    }

    return left.title.localeCompare(right.title);
  });
}

export function getPublicCatalogCounts<TListing extends PublicCatalogListingLike>(listings: TListing[]) {
  return listings.reduce(
    (counts, listing) => {
      counts.total += 1;
      counts[listing.listingType] += 1;
      counts[getPublicListingStatusGroup(listing)] += 1;

      return counts;
    },
    {
      total: 0,
      auction: 0,
      fixed_price: 0,
      available: 0,
      reserved: 0,
      sold: 0,
      closed: 0
    }
  );
}
