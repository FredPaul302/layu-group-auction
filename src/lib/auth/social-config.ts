import { getAppEnv } from "@/lib/config/app-env";

export const socialProviders = ["google", "facebook"] as const;
export type SocialProvider = (typeof socialProviders)[number];
export type SocialProviderConfig = {
  provider: SocialProvider;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  graphVersion: string | null;
  reviewOnly: boolean;
};

export function isSocialProvider(value: string): value is SocialProvider {
  return socialProviders.some((provider) => provider === value);
}

export function getSocialProviderConfig(
  provider: SocialProvider,
  source: Record<string, string | undefined> = process.env,
  appUrl = getAppEnv().app.url
): SocialProviderConfig | null {
  const prefix = provider.toUpperCase();
  const clientId = source[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = source[`${prefix}_CLIENT_SECRET`]?.trim();
  const graphVersion = source.FACEBOOK_GRAPH_API_VERSION?.trim() ?? null;
  const publiclyEnabled = source[`${prefix}_LOGIN_ENABLED`] === "true";
  const reviewOnly = provider === "facebook" && !publiclyEnabled && source.FACEBOOK_LOGIN_REVIEW_ENABLED === "true";
  if ((!publiclyEnabled && !reviewOnly) || !clientId || !clientSecret) return null;
  if (provider === "facebook" && (!graphVersion || !/^v\d+\.\d+$/u.test(graphVersion))) return null;
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null;
  return {
    provider, clientId, clientSecret, graphVersion, reviewOnly,
    callbackUrl: new URL(`/api/auth/social/${provider}/callback`, origin).toString()
  };
}

export function getEnabledSocialProviders(
  source: Record<string, string | undefined> = process.env,
  appUrl = getAppEnv().app.url
) {
  return socialProviders.filter((provider) => {
    const config = getSocialProviderConfig(provider, source, appUrl);
    return config !== null && !config.reviewOnly;
  });
}

export function socialProviderLabel(provider: SocialProvider) {
  return provider === "google" ? "Google" : "Facebook";
}

export function safeSocialNextPath(value: string | null | undefined) {
  if (!value || value.length > 500 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(value)) return "/account";
  const resolved = new URL(value, "https://local.invalid");
  if (resolved.origin !== "https://local.invalid" || resolved.pathname.startsWith("/api/")) return "/account";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
