import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnabledSocialProviders, getSocialProviderConfig, safeSocialNextPath } from "../src/lib/auth/social-config";
import { buildSocialAuthorizationUrl, exchangeSocialCode, validateGoogleIdToken } from "../src/lib/auth/social-provider";

const config = { provider: "google" as const, clientId: "google-client", clientSecret: "test-secret", callbackUrl: "https://market.example/api/auth/social/google/callback", graphVersion: null, reviewOnly: false };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
const validClaims = { sub: "stable-user-id", iss: "https://accounts.google.com", aud: config.clientId, nonce: "browser-nonce", iat: 1000, exp: 2000, email: "user@gmail.com", email_verified: true, name: "Person" };

function token(claims = validClaims, algorithm = "RS256") {
  const header = Buffer.from(JSON.stringify({ alg: algorithm, kid: "test-key" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url")}`;
}

describe("social provider configuration and redirects", () => {
  it("requires explicit enablement and complete server credentials", () => {
    expect(getSocialProviderConfig("google", {}, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("google", { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("google", { GOOGLE_LOGIN_ENABLED: "true", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }, "https://market.example")?.callbackUrl).toBe("https://market.example/api/auth/social/google/callback");
  });
  it("requires an explicit Facebook Graph version and secure public callback", () => {
    const source = { FACEBOOK_LOGIN_ENABLED: "true", FACEBOOK_CLIENT_ID: "id", FACEBOOK_CLIENT_SECRET: "secret" };
    expect(getSocialProviderConfig("facebook", source, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", { ...source, FACEBOOK_GRAPH_API_VERSION: "v22.0" }, "http://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", { ...source, FACEBOOK_GRAPH_API_VERSION: "v22.0" }, "https://market.example")?.provider).toBe("facebook");
  });
  it("keeps Facebook review access separate from public providers and Google", () => {
    const source = { FACEBOOK_LOGIN_REVIEW_ENABLED: "true", FACEBOOK_LOGIN_ENABLED: "false", FACEBOOK_CLIENT_ID: "id", FACEBOOK_CLIENT_SECRET: "secret", FACEBOOK_GRAPH_API_VERSION: "v26.0", GOOGLE_LOGIN_ENABLED: "true", GOOGLE_CLIENT_ID: "google", GOOGLE_CLIENT_SECRET: "google-secret" };
    expect(getSocialProviderConfig("facebook", source, "https://market.example")?.reviewOnly).toBe(true);
    expect(getEnabledSocialProviders(source, "https://market.example")).toEqual(["google"]);
    expect(getSocialProviderConfig("google", { ...source, GOOGLE_LOGIN_ENABLED: "false" }, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", { ...source, FACEBOOK_LOGIN_REVIEW_ENABLED: "false" }, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", { ...source, FACEBOOK_LOGIN_REVIEW_ENABLED: "TRUE" }, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", { ...source, FACEBOOK_CLIENT_SECRET: "" }, "https://market.example")).toBeNull();
    expect(getSocialProviderConfig("facebook", source, "http://market.example")).toBeNull();
    expect(getEnabledSocialProviders({ ...source, FACEBOOK_LOGIN_ENABLED: "true" }, "https://market.example")).toEqual(["google", "facebook"]);
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/api/auth/logout", "/\nevil.example"])("rejects unsafe next path %s", (value) => {
    expect(safeSocialNextPath(value)).toBe("/account");
  });
  it("preserves local destinations", () => expect(safeSocialNextPath("/listings/item?x=1#photos")).toBe("/listings/item?x=1#photos"));
  it("requests only login scopes, with state, nonce and S256 PKCE for Google", () => {
    const url = buildSocialAuthorizationUrl(config, { state: "state", nonce: "nonce", codeVerifier: "verifier" });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("nonce")).toBe("nonce");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.has("code_verifier")).toBe(false);
  });
});

describe("Google ID token validation", () => {
  it("accepts an authentic token for this client, issuer, nonce and time", () => {
    expect(validateGoogleIdToken(token(), config, "browser-nonce", [jwk], 1500)).toMatchObject({ providerAccountId: "stable-user-id", email: "user@gmail.com", emailVerified: true });
  });
  it.each([
    { aud: "another-client" }, { iss: "https://evil.example" }, { nonce: "other-browser" }, { exp: 1499 }, { iat: 1700 }, { sub: "" }, { azp: "another-client" }, { aud: ["google-client", "another-client"] }
  ])("rejects invalid identity claims %j", (changed) => {
    expect(() => validateGoogleIdToken(token({ ...validClaims, ...changed } as typeof validClaims), config, "browser-nonce", [jwk], 1500)).toThrow("social_failed");
  });
  it("rejects a forged signature and wrong algorithm", () => {
    const signed = token();
    expect(() => validateGoogleIdToken(`${signed.slice(0, signed.lastIndexOf(".") + 1)}AAAA`, config, "browser-nonce", [jwk], 1500)).toThrow("social_failed");
    expect(() => validateGoogleIdToken(token(validClaims, "none"), config, "browser-nonce", [jwk], 1500)).toThrow("social_failed");
  });
  it("requires Layu email confirmation for third-party Google emails", () => {
    expect(validateGoogleIdToken(token({ ...validClaims, email: "user@example.com" }), config, "browser-nonce", [jwk], 1500).emailVerified).toBe(false);
  });
});

describe("Facebook server verification", () => {
  afterEach(() => vi.unstubAllGlobals());
  const facebook = { ...config, provider: "facebook" as const, graphVersion: "v22.0" };
  it("checks token ownership, app identity and matching profile; never treats Facebook email as verified", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { is_valid: true, app_id: config.clientId, type: "USER", user_id: "fb-user", expires_at: 0 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "fb-user", name: "FB Person", email: "user@example.com" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeSocialCode(facebook, { code: "code", codeVerifier: "verifier", nonce: "nonce" })).toEqual({ provider: "facebook", providerAccountId: "fb-user", email: "user@example.com", emailVerified: false, displayName: "FB Person" });
    expect(fetchMock.mock.calls[0][1].body.get("client_secret")).toBe(config.clientSecret);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer provider-token");
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.has("appsecret_proof")).toBe(true);
  });
  it("rejects a token issued for a different Facebook app", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { is_valid: true, app_id: "other-app", type: "USER", user_id: "fb-user" } })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeSocialCode(facebook, { code: "code", codeVerifier: "verifier", nonce: "nonce" })).rejects.toThrow("social_failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("replaces malformed provider responses with a safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret-provider-token")));
    await expect(exchangeSocialCode(facebook, { code: "code", codeVerifier: "verifier", nonce: "nonce" })).rejects.toThrow(/^social_failed$/u);
  });
  it("replaces transport errors containing request secrets with a safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("request failed at https://provider?token=secret-provider-token")));
    await expect(exchangeSocialCode(facebook, { code: "code", codeVerifier: "verifier", nonce: "nonce" })).rejects.toThrow(/^social_failed$/u);
  });
});
