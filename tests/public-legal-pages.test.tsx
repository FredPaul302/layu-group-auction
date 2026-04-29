import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PrivacyPage from "../src/app/(public)/privacy/page.js";
import TermsPage from "../src/app/(public)/terms/page.js";
import RegisterPage from "../src/app/(auth)/auth/register/page.js";

describe("public legal pages", () => {
  it("renders the terms page with private beta auction policy content", () => {
    const html = renderToStaticMarkup(<TermsPage />);

    expect(html).toContain("Terms of Use");
    expect(html).toContain("Private beta auction platform");
    expect(html).toContain("Bids and fixed-price claims");
    expect(html).toContain("proof uploads");
    expect(html).toContain("not legal advice");
  });

  it("renders the privacy page with proof upload and service provider content", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);

    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Payment proof uploads");
    expect(html).toContain("deposit proof uploads");
    expect(html).toContain("Persona verification status");
    expect(html).toContain("service providers");
  });

  it("links registration terms acceptance to terms and privacy pages", async () => {
    const html = renderToStaticMarkup(
      await RegisterPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('name="termsAccepted"');
  });
});
