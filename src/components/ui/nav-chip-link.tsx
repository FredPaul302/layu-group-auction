"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

export function NavChipLink({ href, children, className }: NavChipLinkProps) {
  const pathname = usePathname();
  const isActive = matchesPath(pathname, href);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={["nav-chip", isActive ? "nav-chip-active" : null, className]
        .filter(Boolean)
        .join(" ")}
      href={href}
    >
      {children}
    </Link>
  );
}
