import { describe, expect, it } from "vitest";

import { getListingDescriptionConfig } from "../src/lib/ai/listing-description-config.js";

describe("listing description provider configuration", () => {
  it("defaults to the existing OpenAI provider and remains off without opt-in", () => {
    expect(getListingDescriptionConfig({})).toEqual({
      provider: "openai", providerValid: true, requested: false, keyConfigured: false, enabled: false
    });
  });

  it.each([
    { provider: undefined, openai: "openai-test-key", gemini: undefined, enabled: true, selected: "openai", valid: true, configured: true },
    { provider: "", openai: "openai-test-key", gemini: undefined, enabled: true, selected: "openai", valid: true, configured: true },
    { provider: "openai", openai: undefined, gemini: "gemini-test-key", enabled: false, selected: "openai", valid: true, configured: false },
    { provider: "gemini", openai: "openai-test-key", gemini: undefined, enabled: false, selected: "gemini", valid: true, configured: false },
    { provider: "gemini", openai: undefined, gemini: "gemini-test-key", enabled: true, selected: "gemini", valid: true, configured: true },
    { provider: "gemini", openai: undefined, gemini: "  ", enabled: false, selected: "gemini", valid: true, configured: false },
    { provider: "gemini", openai: "openai-test-key", gemini: "gemini-test-key", enabled: true, selected: "gemini", valid: true, configured: true },
    { provider: "another-provider", openai: "openai-test-key", gemini: "gemini-test-key", enabled: false, selected: null, valid: false, configured: false }
  ])("requires the selected provider's key, with no fallback: $provider", ({ provider, openai, gemini, enabled, selected, valid, configured }) => {
    const config = getListingDescriptionConfig({
      AI_LISTING_DESCRIPTIONS_PROVIDER: provider,
      AI_LISTING_DESCRIPTIONS_ENABLED: "true",
      OPENAI_API_KEY: openai,
      GEMINI_API_KEY: gemini
    });
    expect(config).toEqual({ provider: selected, providerValid: valid, requested: true, keyConfigured: configured, enabled });
    expect(JSON.stringify(config)).not.toContain("test-key");
  });

  it.each([undefined, "false", "TRUE", " true "])("requires exact explicit opt-in even with a Gemini key: %s", (flag) => {
    const config = getListingDescriptionConfig({
      AI_LISTING_DESCRIPTIONS_PROVIDER: "gemini",
      AI_LISTING_DESCRIPTIONS_ENABLED: flag,
      GEMINI_API_KEY: "gemini-test-key"
    });
    expect(config.requested).toBe(false);
    expect(config.enabled).toBe(false);
    expect(config.keyConfigured).toBe(true);
  });
});
