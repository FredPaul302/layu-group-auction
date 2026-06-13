"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const NAV_SCROLL_TOP_KEY = "layu-nav-scroll-top";

function scrollWindowToTop() {
  window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  window.requestAnimationFrame(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  });
}

export function markNextNavigationForScrollReset() {
  window.sessionStorage.setItem(NAV_SCROLL_TOP_KEY, "1");
}

export function RouteScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.sessionStorage.getItem(NAV_SCROLL_TOP_KEY) !== "1") {
      return;
    }

    window.sessionStorage.removeItem(NAV_SCROLL_TOP_KEY);
    scrollWindowToTop();
  }, [pathname]);

  return null;
}
