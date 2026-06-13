import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Poppins } from "next/font/google";
import type { ReactNode } from "react";

import { SiteShell } from "@/components/site-shell";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

const siteTitle = "Layu Group LLC Auction";
const siteDescription =
  "Browse Layu Group LLC single-seller auctions and Buy It Now listings with clear verification, payment, and fulfillment steps.";
const sitePreviewImage = "/images/page-headers/layu-auction-home.png";

function getMetadataBase() {
  try {
    return new URL(process.env.APP_URL ?? "https://auction.layu.llc");
  } catch {
    return new URL("https://auction.layu.llc");
  }
}

export function generateMetadata(): Metadata {
  const metadataBase = getMetadataBase();
  const previewImageUrl = new URL(sitePreviewImage, metadataBase);

  return {
    metadataBase,
    title: siteTitle,
    description: siteDescription,
    alternates: {
      canonical: "/"
    },
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      url: "/",
      siteName: siteTitle,
      type: "website",
      images: [
        {
          url: previewImageUrl.href,
          width: 1536,
          height: 1024,
          alt: "Layu Auction header artwork arranged from vintage auction finds"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [previewImageUrl.href]
    }
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${poppins.variable}`}
      data-theme="light"
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/bov8fti.css" />
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const storedTheme = window.localStorage.getItem("theme");
    const resolvedTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = resolvedTheme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`
          }}
        />
      </head>
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
