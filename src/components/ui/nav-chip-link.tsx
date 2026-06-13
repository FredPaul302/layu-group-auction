"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { markNextNavigationForScrollReset } from "@/components/ui/route-scroll-reset";

type NavChipLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

function matchesPath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function scrollToTopAfterNavigation() {
  window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  window.requestAnimationFrame(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  });
  window.setTimeout(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, 80);
}

export function NavChipLink({ href, children, className }: NavChipLinkProps) {
  const pathname = usePathname();
  const isActive = matchesPath(pathname, href);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (pathname !== href) {
      markNextNavigationForScrollReset();
    }

    scrollToTopAfterNavigation();
  };

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={["nav-chip", isActive ? "nav-chip-active" : null, className]
        .filter(Boolean)
        .join(" ")}
      href={href}
      onClick={handleClick}
      scroll
    >
      {children}
    </Link>
  );
}
