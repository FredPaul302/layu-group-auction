"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem("theme");

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("theme", theme);
}

function getDocumentTheme(): ThemeMode | null {
  if (typeof document === "undefined") {
    return null;
  }

  const documentTheme = document.documentElement.dataset.theme;

  return documentTheme === "light" || documentTheme === "dark" ? documentTheme : null;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextTheme = getDocumentTheme() ?? getPreferredTheme();
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div aria-label="Theme" className="theme-toggle" role="group">
      <button
        aria-pressed={theme === "light"}
        className={["theme-toggle__button", theme === "light" ? "is-active" : null]
          .filter(Boolean)
          .join(" ")}
        onClick={() => updateTheme("light")}
        type="button"
      >
        Light
      </button>
      <button
        aria-pressed={theme === "dark"}
        className={["theme-toggle__button", theme === "dark" ? "is-active" : null]
          .filter(Boolean)
          .join(" ")}
        onClick={() => updateTheme("dark")}
        type="button"
      >
        Dark
      </button>
    </div>
  );
}
