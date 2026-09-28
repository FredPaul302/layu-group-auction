import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";

import { redirectToAppUrl } from "@/app/api/_utils/app-url-redirect";
import { requireSameOriginRequest } from "@/app/api/_utils/origin";
import { createSignedSessionCookie, getCurrentUserFromCookieSource, issueEmailVerification } from "@/lib/auth";
import { consumeRateLimits, getClientIp } from "@/lib/rate-limit";

import { getSocialProviderConfig, isSocialProvider, type SocialProvider } from "./social-config";
import { buildSocialAuthorizationUrl, exchangeSocialCode, SocialAuthError } from "./social-provider";
import { consumeSocialAttempt, createSocialAttempt, disconnectSocialAccount, resolveSocialIdentity, type SocialIntent } from "./social-service";

export function socialCookieName(provider: SocialProvider) {
  return `${process.env.NODE_ENV === "production" ? "__Host-" : ""}layu_oauth_${provider}`;
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function authError(error: unknown) {
  return error instanceof SocialAuthError ? error.code : "social_failed";
}

export async function startSocialLogin(request: NextRequest, rawProvider: string) {
  const originFailure = requireSameOriginRequest(request);
  if (originFailure) return originFailure;
  if (!isSocialProvider(rawProvider)) return Response.json({ error: "Unknown sign-in provider." }, { status: 404 });
  const config = getSocialProviderConfig(rawProvider);
  if (!config) return privateResponse(redirectToAppUrl("/auth/login", { error: "social_disabled" }));
  const defaultErrorPath = config.reviewOnly ? "/auth/facebook-review" : "/auth/login";
  const limited = await consumeRateLimits([{ bucket: "auth:social:start", identifiers: [getClientIp(request.headers)], limit: 30, windowMs: 10 * 60 * 1000 }]);
  if (limited) return privateResponse(redirectToAppUrl(defaultErrorPath, { error: "too_many_attempts" }));
  const data = await request.formData();
  const rawIntent = String(data.get("intent") ?? "signin");
  const intent: SocialIntent = rawIntent === "link" || rawIntent === "register" ? rawIntent : "signin";
  const errorPath = config.reviewOnly
    ? intent === "register" ? "/auth/facebook-review?mode=register" : "/auth/facebook-review"
    : intent === "link" ? "/account/connections" : intent === "register" ? "/auth/register" : "/auth/login";
  try {
    const currentUser = intent === "link" ? await getCurrentUserFromCookieSource(request.cookies) : null;
    const attempt = await createSocialAttempt({ provider: rawProvider, intent, currentUser, termsAccepted: data.get("termsAccepted") === "yes", nextPath: String(data.get("next") ?? "") });
    const response = privateResponse(Response.redirect(buildSocialAuthorizationUrl(config, attempt), 303));
    response.cookies.set(socialCookieName(rawProvider), attempt.browserToken, { ...cookieOptions(), expires: attempt.expiresAtUtc });
    return response;
  } catch (error) {
    return privateResponse(redirectToAppUrl(errorPath, { error: authError(error) }));
  }
}

export async function finishSocialLogin(request: NextRequest, rawProvider: string) {
  if (!isSocialProvider(rawProvider)) return Response.json({ error: "Unknown sign-in provider." }, { status: 404 });
  let errorPath = "/auth/login";
  const clearAttempt = (response: NextResponse) => {
    response.cookies.set(socialCookieName(rawProvider), "", { ...cookieOptions(), expires: new Date(0), maxAge: 0 });
    return privateResponse(response);
  };
  try {
    const config = getSocialProviderConfig(rawProvider);
    if (!config) throw new SocialAuthError("social_disabled");
    if (config.reviewOnly) errorPath = "/auth/facebook-review";
    const attempt = await consumeSocialAttempt(rawProvider, request.nextUrl.searchParams.get("state") ?? "", request.cookies.get(socialCookieName(rawProvider))?.value ?? "");
    errorPath = config.reviewOnly
      ? attempt.intent === "register" ? "/auth/facebook-review?mode=register" : "/auth/facebook-review"
      : attempt.intent === "link" ? "/account/connections" : attempt.intent === "register" ? "/auth/register" : "/auth/login";
    if (request.nextUrl.searchParams.has("error")) throw new SocialAuthError("social_cancelled");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) throw new SocialAuthError("social_failed");
    const identity = await exchangeSocialCode(config, { code, codeVerifier: attempt.codeVerifier, nonce: attempt.nonce });
    const currentUser = attempt.intent === "link" ? await getCurrentUserFromCookieSource(request.cookies) : null;
    const result = await resolveSocialIdentity({ identity, intent: attempt.intent, linkedUserId: attempt.userId, currentUser, termsVersion: attempt.termsVersion });
    if (attempt.intent === "link") return clearAttempt(redirectToAppUrl(config.reviewOnly ? "/auth/facebook-review" : "/account/connections", { status: "connected" }));
    if (result.created && !result.user.emailVerifiedAtUtc) {
      try { await issueEmailVerification(result.user); } catch { /* Account page offers a safe resend if delivery is temporarily unavailable. */ }
    }
    const session = await createSignedSessionCookie(result.user);
    const response = clearAttempt(redirectToAppUrl(result.user.emailVerifiedAtUtc ? attempt.nextPath : "/auth/verify-email"));
    response.cookies.set(session.cookieName, session.cookieValue, session.cookieOptions);
    return response;
  } catch (error) {
    return clearAttempt(redirectToAppUrl(errorPath, { error: authError(error) }));
  }
}

export async function disconnectSocialLogin(request: NextRequest, rawProvider: string) {
  const originFailure = requireSameOriginRequest(request);
  if (originFailure) return originFailure;
  if (!isSocialProvider(rawProvider)) return Response.json({ error: "Unknown sign-in provider." }, { status: 404 });
  const user = await getCurrentUserFromCookieSource(request.cookies);
  if (!user) return privateResponse(redirectToAppUrl("/auth/login", { next: "/account/connections" }));
  try {
    const data = await request.formData();
    if (data.get("confirmDisconnect") !== "yes") throw new SocialAuthError("social_disconnect_confirm");
    await disconnectSocialAccount(user.id, rawProvider);
    return privateResponse(redirectToAppUrl("/account/connections", { status: "disconnected" }));
  } catch (error) {
    return privateResponse(redirectToAppUrl("/account/connections", { error: authError(error) }));
  }
}
