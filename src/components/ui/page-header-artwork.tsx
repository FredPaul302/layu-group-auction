import Image from "next/image";

type PageHeaderArtworkVariant = "home" | "listings" | "account";

type PageHeaderArtworkProps = {
  variant: PageHeaderArtworkVariant;
  priority?: boolean;
  className?: string;
};

const artworkByVariant: Record<
  PageHeaderArtworkVariant,
  {
    src: string;
    alt: string;
  }
> = {
  home: {
    src: "/images/page-headers/layu-auction-home.png",
    alt: "Layu Auction header artwork arranged from vintage auction finds"
  },
  listings: {
    src: "/images/page-headers/layu-auction-listings.png",
    alt: "Listings header artwork arranged from vintage auction finds"
  },
  account: {
    src: "/images/page-headers/layu-auction-dashboard.png",
    alt: "Auction dashboard header artwork arranged from vintage auction finds"
  }
};

export function PageHeaderArtwork({
  variant,
  priority = false,
  className
}: PageHeaderArtworkProps) {
  const artwork = artworkByVariant[variant];

  return (
    <div
      className={["page-header-artwork motion-section motion-delay-1", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Image
        alt={artwork.alt}
        className="page-header-artwork__image"
        height={1024}
        priority={priority}
        sizes="(max-width: 768px) calc(100vw - 2rem), min(100vw - 2rem, 1180px)"
        src={artwork.src}
        width={1536}
      />
    </div>
  );
}
