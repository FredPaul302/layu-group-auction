import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CategoryCatalogMark,
  EmptyStateGraphic,
  TrustSeal
} from "../src/components/visual/auction-graphics.js";

describe("auction visual graphics", () => {
  it("maps category names to catalog mark variants", () => {
    const games = renderToStaticMarkup(<CategoryCatalogMark name="Video Games" slug="games" />);
    const botanical = renderToStaticMarkup(
      <CategoryCatalogMark name="Wellness botanicals" slug="cultivar" />
    );
    const fallback = renderToStaticMarkup(<CategoryCatalogMark name="Odd lots" slug="misc" />);

    expect(games).toContain("category-mark--games");
    expect(botanical).toContain("category-mark--botanical");
    expect(fallback).toContain("category-mark--misc");
  });

  it("renders motif-aware empty graphics and trust seals", () => {
    const emptyStateGraphic = renderToStaticMarkup(<EmptyStateGraphic motif="cat" />);
    const trustSeal = renderToStaticMarkup(
      <TrustSeal
        kind="payment"
        title="Manual payment review"
        caption="External proof remains reviewable"
      />
    );

    expect(emptyStateGraphic).toContain("empty-graphic--cat");
    expect(trustSeal).toContain("trust-seal--payment");
    expect(trustSeal).toContain("Manual payment review");
  });
});
