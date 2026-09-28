export type ListingDescriptionProvider = "openai" | "gemini";

// Configuration diagnostics expose presence flags only, never provider keys.
export function getListingDescriptionConfig(source: Record<string, string | undefined> = process.env) {
  const providerName = source.AI_LISTING_DESCRIPTIONS_PROVIDER?.trim() || "openai";
  const provider: ListingDescriptionProvider | null = providerName === "openai" || providerName === "gemini"
    ? providerName
    : null;
  const requested = source.AI_LISTING_DESCRIPTIONS_ENABLED === "true";
  const keyConfigured = provider === "gemini"
    ? Boolean(source.GEMINI_API_KEY?.trim())
    : provider === "openai" && Boolean(source.OPENAI_API_KEY?.trim());

  return {
    provider,
    providerValid: provider !== null,
    requested,
    keyConfigured,
    enabled: requested && provider !== null && keyConfigured
  };
}
