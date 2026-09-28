import { createHash, createHmac, createPublicKey, verify } from "node:crypto";

import type { SocialProviderConfig } from "./social-config";

export type SocialIdentity = {
  provider: "google" | "facebook";
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
};

type JsonRecord = Record<string, unknown>;
type SigningKey = JsonWebKey & { kid?: string; use?: string; alg?: string };
let googleKeys: { keys: SigningKey[]; expiresAt: number } | null = null;

export class SocialAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SocialAuthError";
  }
}

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SocialAuthError("social_failed");
  return value as JsonRecord;
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonRecord> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    const text = await response.text();
    if (text.length > 100_000) throw new Error();
    return object(JSON.parse(text));
  } catch {
    // Even malformed JSON and transport exceptions can contain secrets in their
    // messages. Never propagate provider responses, URLs, codes, or tokens.
    throw new SocialAuthError("social_failed");
  }
}

export function buildSocialAuthorizationUrl(config: SocialProviderConfig, input: { state: string; codeVerifier: string; nonce: string }) {
  const url = new URL(config.provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : `https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", config.provider === "google" ? "openid email profile" : "email,public_profile");
  if (config.provider === "google") {
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", createHash("sha256").update(input.codeVerifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
  }
  return url;
}

async function getGoogleKeys(forceRefresh = false) {
  if (googleKeys && googleKeys.expiresAt > Date.now() && !forceRefresh) return googleKeys.keys;
  const result = await fetchJson("https://www.googleapis.com/oauth2/v3/certs");
  if (!Array.isArray(result.keys)) throw new SocialAuthError("social_failed");
  const keys = result.keys.map((key) => object(key) as SigningKey);
  googleKeys = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

export function validateGoogleIdToken(
  idToken: string,
  config: Pick<SocialProviderConfig, "clientId">,
  nonce: string,
  keys: SigningKey[],
  nowSeconds = Math.floor(Date.now() / 1000)
): SocialIdentity {
  try {
    const segments = idToken.split(".");
    if (segments.length !== 3 || idToken.length > 20_000 || segments.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) throw new Error();
    const header = object(JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8")));
    const claims = object(JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")));
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.crit !== undefined || header.b64 === false) throw new Error();
    const key = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA" && (!candidate.use || candidate.use === "sig") && (!candidate.alg || candidate.alg === "RS256"));
    if (!key || !verify("RSA-SHA256", Buffer.from(`${segments[0]}.${segments[1]}`), createPublicKey({ key, format: "jwk" }), Buffer.from(segments[2], "base64url"))) throw new Error();
    const audiences = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
    if (!audiences.includes(config.clientId) || (audiences.length > 1 && claims.azp !== config.clientId) || (claims.azp !== undefined && claims.azp !== config.clientId)) throw new Error();
    if (!["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) || claims.nonce !== nonce) throw new Error();
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= nowSeconds || typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60 || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > nowSeconds + 60))) throw new Error();
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new Error();
    const email = typeof claims.email === "string" ? claims.email.trim() : null;
    // Google is authoritative for Gmail and verified Workspace addresses. Other addresses
    // still receive Layu's confirmation, even when Google once verified that address.
    const googleOwnsEmail = email?.toLowerCase().endsWith("@gmail.com") || (typeof claims.hd === "string" && claims.hd.length > 0);
    return {
      provider: "google", providerAccountId: claims.sub, email,
      emailVerified: claims.email_verified === true && Boolean(googleOwnsEmail),
      displayName: typeof claims.name === "string" ? claims.name.slice(0, 120) : null
    };
  } catch {
    throw new SocialAuthError("social_failed");
  }
}

export async function exchangeSocialCode(config: SocialProviderConfig, input: { code: string; codeVerifier: string; nonce: string }): Promise<SocialIdentity> {
  if (config.provider === "google") {
    const result = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callbackUrl, code: input.code, grant_type: "authorization_code", code_verifier: input.codeVerifier })
    });
    if (typeof result.id_token !== "string") throw new SocialAuthError("social_failed");
    const keys = await getGoogleKeys();
    try {
      return validateGoogleIdToken(result.id_token, config, input.nonce, keys);
    } catch {
      // Refresh once for key rotation; every claim and signature is checked again.
      return validateGoogleIdToken(result.id_token, config, input.nonce, await getGoogleKeys(true));
    }
  }

  const baseUrl = `https://graph.facebook.com/${config.graphVersion}`;
  const token = await fetchJson(`${baseUrl}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callbackUrl, code: input.code })
  });
  if (typeof token.access_token !== "string" || !token.access_token) throw new SocialAuthError("social_failed");
  const debugUrl = new URL(`${baseUrl}/debug_token`);
  debugUrl.searchParams.set("input_token", token.access_token);
  const debug = object((await fetchJson(debugUrl.toString(), { headers: { Authorization: `Bearer ${config.clientId}|${config.clientSecret}` } })).data);
  const now = Math.floor(Date.now() / 1000);
  if (debug.is_valid !== true || String(debug.app_id) !== config.clientId || debug.type !== "USER" || typeof debug.user_id !== "string" || !debug.user_id || (typeof debug.expires_at === "number" && debug.expires_at !== 0 && debug.expires_at <= now) || (typeof debug.data_access_expires_at === "number" && debug.data_access_expires_at !== 0 && debug.data_access_expires_at <= now)) throw new SocialAuthError("social_failed");
  const profileUrl = new URL(`${baseUrl}/me`);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("appsecret_proof", createHmac("sha256", config.clientSecret).update(token.access_token).digest("hex"));
  const profile = await fetchJson(profileUrl.toString(), { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (profile.id !== debug.user_id || debug.user_id.length > 255) throw new SocialAuthError("social_failed");
  return { provider: "facebook", providerAccountId: debug.user_id, email: typeof profile.email === "string" ? profile.email.trim() : null, emailVerified: false, displayName: typeof profile.name === "string" ? profile.name.slice(0, 120) : null };
}
