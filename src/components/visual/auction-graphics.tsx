import type { ReactNode } from "react";

export type MotifVariant = "neutral" | "gaming" | "cat" | "botanical";

type CategoryCatalogKind =
  | "electronics"
  | "collectibles"
  | "tools"
  | "games"
  | "furniture"
  | "art_media"
  | "cat"
  | "botanical"
  | "misc";

type Tone = "accent" | "success" | "warning" | "danger" | "info" | "muted";

type CategoryLike = {
  name?: string | null;
  slug?: string | null;
};

const categoryKindLabels: Record<CategoryCatalogKind, string> = {
  electronics: "Electronics",
  collectibles: "Collectibles",
  tools: "Tools",
  games: "Games",
  furniture: "Furniture",
  art_media: "Art and media",
  cat: "Cat",
  botanical: "Botanical",
  misc: "Miscellaneous"
};

function textFromCategory(category: CategoryLike | string) {
  if (typeof category === "string") {
    return category.toLowerCase();
  }

  return `${category.name ?? ""} ${category.slug ?? ""}`.toLowerCase();
}

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function getCategoryCatalogKind(category: CategoryLike | string): CategoryCatalogKind {
  const text = textFromCategory(category);

  if (hasAnyTerm(text, ["cat", "feline", "kitty", "pet"])) {
    return "cat";
  }

  if (
    hasAnyTerm(text, [
      "botanical",
      "cannabis",
      "cultivar",
      "garden",
      "greenhouse",
      "hemp",
      "plant",
      "wellness"
    ])
  ) {
    return "botanical";
  }

  if (hasAnyTerm(text, ["game", "gaming", "arcade", "console", "controller", "switch"])) {
    return "games";
  }

  if (hasAnyTerm(text, ["electronic", "computer", "camera", "audio", "phone", "tech"])) {
    return "electronics";
  }

  if (hasAnyTerm(text, ["collectible", "card", "coin", "toy", "vintage", "memorabilia"])) {
    return "collectibles";
  }

  if (hasAnyTerm(text, ["tool", "hardware", "shop", "garage", "drill"])) {
    return "tools";
  }

  if (hasAnyTerm(text, ["furniture", "chair", "table", "desk", "home", "decor"])) {
    return "furniture";
  }

  if (hasAnyTerm(text, ["art", "media", "book", "vinyl", "music", "poster", "print", "film"])) {
    return "art_media";
  }

  return "misc";
}

export function getCategoryMotif(category: CategoryLike | string): MotifVariant {
  const kind = getCategoryCatalogKind(category);

  if (kind === "games") {
    return "gaming";
  }

  if (kind === "cat") {
    return "cat";
  }

  if (kind === "botanical") {
    return "botanical";
  }

  return "neutral";
}

function CategoryIcon({ kind }: { kind: CategoryCatalogKind }) {
  switch (kind) {
    case "electronics":
      return (
        <>
          <rect height="22" rx="2" width="28" x="10" y="11" />
          <path d="M16 37h16M20 33v4M28 33v4M17 19h4M27 19h4M17 25h14" />
        </>
      );
    case "collectibles":
      return (
        <>
          <path d="m24 8 14 10-14 22L10 18 24 8Z" />
          <path d="m16 19 8-6 8 6-8 13-8-13Z" />
          <circle cx="24" cy="21" r="3" />
        </>
      );
    case "tools":
      return (
        <>
          <path d="m15 33 17-17" />
          <path d="m26 10 10 10M31 9l8 8" />
          <path d="M10 34h10l-5 6-5-6Z" />
          <path d="M13 31 31 13" />
        </>
      );
    case "games":
      return (
        <>
          <rect height="24" rx="4" width="32" x="8" y="13" />
          <path d="M16 25h10M21 20v10" />
          <circle cx="31" cy="22" r="2" />
          <circle cx="35" cy="28" r="2" />
          <path d="M12 13v-3h7M36 37v3h-7" />
        </>
      );
    case "furniture":
      return (
        <>
          <path d="M14 24h20v13M18 24V13h18v11" />
          <path d="M12 37h24M16 37v-8h16v8" />
          <path d="M18 18h12" />
        </>
      );
    case "art_media":
      return (
        <>
          <rect height="27" rx="2" width="30" x="9" y="10" />
          <path d="m16 30 6-8 5 6 3-4 4 6" />
          <path d="m22 16 8 5-8 5V16Z" />
        </>
      );
    case "cat":
      return (
        <>
          <path d="M13 35V17l7 5 4-1 4 1 7-5v18H13Z" />
          <path d="M18 28h.01M30 28h.01M22 31h4" />
          <path d="M12 29H7M36 29h5M13 33H8M35 33h5" />
        </>
      );
    case "botanical":
      return (
        <>
          <path d="M24 39V14" />
          <path d="M24 17c-8-2-13 2-14 9 8 2 13-2 14-9Z" />
          <path d="M25 20c9-1 13 4 12 12-8 1-12-4-12-12Z" />
          <path d="M18 25c4 1 6 4 6 8M30 29c-4 1-6 4-6 8" />
        </>
      );
    case "misc":
    default:
      return (
        <>
          <path d="M24 8v32M8 24h32M13 13l22 22M35 13 13 35" />
          <circle cx="24" cy="24" r="9" />
        </>
      );
  }
}

export function CategoryCatalogMark({
  name,
  slug,
  size = "md",
  showLabel = false,
  className
}: {
  name: string;
  slug?: string | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}) {
  const kind = getCategoryCatalogKind({ name, slug });
  const accessibleLabel = `${name || categoryKindLabels[kind]} catalog mark`;

  return (
    <span
      aria-label={showLabel ? undefined : accessibleLabel}
      className={[
        "category-mark",
        `category-mark--${kind}`,
        `category-mark--${size}`,
        showLabel ? "category-mark--labeled" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      role={showLabel ? undefined : "img"}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
        <CategoryIcon kind={kind} />
      </svg>
      {showLabel ? <span className="category-mark__label">{name}</span> : null}
    </span>
  );
}

export function formatLotNumber(seed: string, prefix = "LOT") {
  let hash = 23;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9000;
  }

  return `${prefix} ${String((hash % 900) + 100).padStart(3, "0")}`;
}

export function LotMarker({
  seed,
  label,
  descriptor,
  tone = "accent",
  className
}: {
  seed?: string;
  label?: string;
  descriptor?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={["lot-marker", `lot-marker--${tone}`, className].filter(Boolean).join(" ")}
    >
      <span className="lot-marker__number">{label ?? formatLotNumber(seed ?? "listing")}</span>
      {descriptor ? <span className="lot-marker__descriptor">{descriptor}</span> : null}
    </span>
  );
}

export function MediaBadge({
  kind,
  count,
  label,
  tone = "muted",
  className
}: {
  kind: "photo" | "video" | "lot" | "proof";
  count?: number;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const resolvedLabel =
    label ??
    (count == null
      ? kind
      : `${count} ${kind}${count === 1 ? "" : kind === "proof" ? "s" : "s"}`);

  return (
    <span className={["media-badge", `media-badge--${tone}`, className].filter(Boolean).join(" ")}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
        {kind === "video" ? (
          <path d="M3 4h7v8H3V4Zm7 3 3-2v6l-3-2" />
        ) : kind === "photo" ? (
          <path d="M3 4h10v8H3V4Zm2 6 2-3 2 2 1-1 2 2M5 6h.01" />
        ) : kind === "proof" ? (
          <path d="M5 2h6l2 2v10H5V2Zm6 0v3h3M7 8h4M7 11h3M3 5v9h8" />
        ) : (
          <path d="M3 3h10v10H3V3Zm3 0v10M10 3v10M3 6h10M3 10h10" />
        )}
      </svg>
      {resolvedLabel}
    </span>
  );
}

export function StatusRibbon({
  label,
  tone = "accent",
  className
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={["status-ribbon", `status-ribbon--${tone}`, className].filter(Boolean).join(" ")}>
      {label}
    </span>
  );
}

export function AngularDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={["angular-divider", className].filter(Boolean).join(" ")} />;
}

export function GeometricFrame({
  children,
  motif = "neutral",
  className
}: {
  children: ReactNode;
  motif?: MotifVariant;
  className?: string;
}) {
  return (
    <div className={["geometric-frame", `geometric-frame--${motif}`, className].filter(Boolean).join(" ")}>
      {children}
      <span aria-hidden="true" className="geometric-frame__corner geometric-frame__corner--tl" />
      <span aria-hidden="true" className="geometric-frame__corner geometric-frame__corner--br" />
    </div>
  );
}

function SealIcon({ kind }: { kind: "verified" | "payment" | "seller" | "secure" }) {
  switch (kind) {
    case "payment":
      return (
        <>
          <path d="M18 12h12l4 5v19H14V12h4Z" />
          <path d="M30 12v6h5M19 25h10M19 30h7" />
          <path d="M22 21c0-2 4-2 4 0s-4 2-4 4 4 2 4 0" />
        </>
      );
    case "seller":
      return (
        <>
          <path d="m24 10 12 7v14l-12 7-12-7V17l12-7Z" />
          <path d="M17 25h14M20 20h8M20 30h8" />
          <path d="M15 16h18" />
        </>
      );
    case "secure":
      return (
        <>
          <path d="M14 22h20v15H14V22Z" />
          <path d="M18 22v-5a6 6 0 0 1 12 0v5" />
          <path d="M24 28v4" />
          <circle cx="24" cy="27" r="1" />
        </>
      );
    case "verified":
    default:
      return (
        <>
          <path d="m24 8 5 5 7 1 1 7 5 5-5 5-1 7-7 1-5 5-5-5-7-1-1-7-5-5 5-5 1-7 7-1 5-5Z" />
          <path d="m17 25 5 5 10-12" />
        </>
      );
  }
}

export function TrustSeal({
  kind,
  title,
  caption,
  motif = "neutral",
  className
}: {
  kind: "verified" | "payment" | "seller" | "secure";
  title: string;
  caption?: string;
  motif?: MotifVariant;
  className?: string;
}) {
  return (
    <div className={["trust-seal", `trust-seal--${kind}`, `trust-seal--${motif}`, className].filter(Boolean).join(" ")}>
      <span className="trust-seal__icon" aria-hidden="true">
        <svg focusable="false" viewBox="0 0 48 48">
          <SealIcon kind={kind} />
        </svg>
      </span>
      <span className="trust-seal__copy">
        <span className="trust-seal__title">{title}</span>
        {caption ? <span className="trust-seal__caption">{caption}</span> : null}
      </span>
    </div>
  );
}

export function EmptyStateGraphic({ motif = "neutral" }: { motif?: MotifVariant }) {
  return (
    <span aria-hidden="true" className={["empty-graphic", `empty-graphic--${motif}`].join(" ")}>
      <svg focusable="false" viewBox="0 0 96 72">
        <path className="empty-graphic__frame" d="M17 18h52l10 10v30H17V18Z" />
        <path className="empty-graphic__grid" d="M25 28h44M25 38h44M25 48h35M35 20v36M52 20v36" />
        {motif === "cat" ? (
          <>
            <path className="empty-graphic__motif" d="M63 30v-9l5 4 5-4v9" />
            <path className="empty-graphic__motif" d="M64 33h8M62 37h12" />
          </>
        ) : motif === "botanical" ? (
          <>
            <path className="empty-graphic__motif" d="M70 55V33" />
            <path className="empty-graphic__motif" d="M70 38c-8-1-12 3-12 10 8 1 12-3 12-10Z" />
            <path className="empty-graphic__motif" d="M71 42c8-1 12 3 11 10-7 1-11-3-11-10Z" />
          </>
        ) : motif === "gaming" ? (
          <>
            <path className="empty-graphic__motif" d="M62 32h18v14H62V32Z" />
            <path className="empty-graphic__motif" d="M67 39h6M70 36v6M76 37h.01M79 41h.01" />
          </>
        ) : (
          <>
            <path className="empty-graphic__motif" d="M65 32h15M65 39h10M65 46h15" />
            <path className="empty-graphic__motif" d="M22 59h58" />
          </>
        )}
      </svg>
    </span>
  );
}

export function AuctionHeroVisual({
  availableCount,
  liveAuctionCount,
  reservedCount,
  featuredTitle,
  featuredMeta
}: {
  availableCount: number;
  liveAuctionCount: number;
  reservedCount: number;
  featuredTitle?: string | null;
  featuredMeta?: string | null;
}) {
  return (
    <div className="auction-hero-visual" aria-label="Auction catalog visual summary">
      <span aria-hidden="true" className="auction-hero-visual__pixel-grid" />
      <span aria-hidden="true" className="auction-hero-visual__diagonal" />

      <div className="auction-hero-visual__card auction-hero-visual__card--primary">
        <div className="auction-hero-visual__card-top">
          <LotMarker label="LOT 108" tone="accent" />
          <StatusRibbon label="Bid pulse" tone="accent" />
        </div>
        <p className="auction-hero-visual__big-number tabular-data">{liveAuctionCount}</p>
        <p className="meta-label">Timed lots live</p>
        <div className="auction-hero-visual__meter" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="auction-hero-visual__card auction-hero-visual__card--offset">
        <div className="auction-hero-visual__card-top">
          <CategoryCatalogMark name="Arcade inventory" slug="games" />
          <MediaBadge kind="lot" label={`${availableCount} catalog records`} tone="info" />
        </div>
        <p className="auction-hero-visual__title">
          {featuredTitle ?? "Catalog room opening soon"}
        </p>
        <p className="auction-hero-visual__meta">
          {featuredMeta ?? "New lots inherit tier, deadline, and fulfillment marks."}
        </p>
      </div>

      <div className="auction-hero-visual__card auction-hero-visual__card--seal">
        <TrustSeal
          kind="secure"
          motif="gaming"
          title="Verified entry"
          caption="Email first, then identity or deposit review"
        />
        <div className="auction-hero-visual__micro-row">
          <MediaBadge kind="proof" label={`${reservedCount} in payment review`} tone="warning" />
        </div>
      </div>
    </div>
  );
}
