import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setting = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { siteSetting: setting } }));

import DataDeletionPage from "../src/app/(auth)/auth/data-deletion/page";
import { validSupportEmail } from "../src/lib/auth/social-support";

describe("public social data deletion instructions", () => {
  beforeEach(() => vi.resetAllMocks());
  it("uses the current support email from site settings", async () => {
    setting.findUnique.mockResolvedValue({ supportEmail: "help@market.example" });
    const html = renderToStaticMarkup(await DataDeletionPage());
    expect(html).toContain("help@market.example");
    expect(html).toContain("mailto:help%40market.example");
    expect(html).toContain("/account/connections");
    expect(html).toContain("confirm ownership");
  });
  it("does not invent a contact address if support is missing", async () => {
    setting.findUnique.mockResolvedValue(null);
    const html = renderToStaticMarkup(await DataDeletionPage());
    expect(html).toContain("support email is not currently configured");
    expect(html).not.toContain("mailto:");
  });
  it.each(["", "not-an-email", "a@b.example?bcc=attacker@evil.example", "a@b.example\r\nCc:attacker@evil.example"])("rejects invalid support contact %s", (email) => {
    expect(validSupportEmail(email)).toBeNull();
  });
});
