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

export const metadata: Metadata = {
  title: "Layu Group LLC Auction",
  description: "Scaffolded single-seller auction platform for phased implementation."
};

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
