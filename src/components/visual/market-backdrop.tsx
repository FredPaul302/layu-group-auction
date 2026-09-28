"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  createMarketBackgroundSession,
  isQuietMarketBackgroundRoute,
  type MarketBackgroundScene
} from "@/lib/ui/market-backgrounds";

function MarketProp({ cell, placement }: { cell: number; placement: "left" | "right" | "footer" }) {
  const style = {
    "--prop-x": `${(cell % 3) * 50}%`,
    "--prop-y-light": `${Math.floor(cell / 3) * 100 / 3}%`,
    "--prop-y-dark": `${(Math.floor(cell / 3) + 2) * 100 / 3}%`
  } as CSSProperties;

  return <span className={`market-prop market-prop--${placement}`} style={style} />;
}

export function MarketBackdrop({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const quiet = isQuietMarketBackgroundRoute(pathname);
  const sessionRef = useRef<ReturnType<typeof createMarketBackgroundSession> | null>(null);
  const [assigned, setAssigned] = useState<{ pathname: string; scene: MarketBackgroundScene } | null>(null);

  useEffect(() => {
    if (quiet) return;
    const frame = window.requestAnimationFrame(() => {
      if (!sessionRef.current) {
        let storage: Storage | null = null;
        try { storage = window.sessionStorage; } catch { /* Private browsing can block storage. */ }
        sessionRef.current = createMarketBackgroundSession({ storage });
      }
      setAssigned({ pathname, scene: sessionRef.current.getSceneForPath(pathname) });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, quiet]);

  const scene = !quiet && assigned?.pathname === pathname ? assigned.scene : null;

  return (
    <div className={`app-shell market-canvas${quiet ? " market-canvas--quiet" : ""}`}>
      {scene ? (
        <div aria-hidden="true" className="market-scenery" data-scene={scene.id}>
          <MarketProp cell={scene.secondaryCell} placement="left" />
          {scene.thirdCell !== undefined ? <MarketProp cell={scene.thirdCell} placement="right" /> : null}
          <MarketProp cell={scene.primaryCell} placement="footer" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function MarketMasthead() {
  return (
    <Link aria-label="Layu Market home" className="market-masthead" href="/">
      <span aria-hidden="true" className="market-masthead__image" />
    </Link>
  );
}
