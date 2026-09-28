import { Prisma } from "@prisma/client";

import { authUserSelect, isValidEmail, normalizeEmail, type AuthenticatedUser } from "@/lib/auth";
import { getCurrentTermsVersion } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";

import { getEnabledSocialProviders, safeSocialNextPath, type SocialProvider } from "./social-config";
import { SocialAuthError, type SocialIdentity } from "./social-provider";
import { createOpaqueToken, hashOpaqueToken } from "./tokens";

export type SocialIntent = "signin" | "register" | "link";

export async function createSocialAttempt(input: {
  provider: SocialProvider;
  intent: SocialIntent;
  currentUser: AuthenticatedUser | null;
  termsAccepted: boolean;
  nextPath?: string;
}) {
  if (input.intent === "link" && (!input.currentUser || !input.currentUser.emailVerifiedAtUtc)) throw new SocialAuthError("social_verify_first");
  if (input.intent === "register" && !input.termsAccepted) throw new SocialAuthError("terms_required");
  const state = createOpaqueToken();
  const browserToken = createOpaqueToken();
  const codeVerifier = createOpaqueToken(48);
  const nonce = createOpaqueToken();
  const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.socialLoginAttempt.deleteMany({ where: { expiresAtUtc: { lt: new Date() } } });
  await prisma.socialLoginAttempt.create({
    data: {
      stateHash: hashOpaqueToken(state), browserTokenHash: hashOpaqueToken(browserToken),
      provider: input.provider, intent: input.intent,
      userId: input.intent === "link" ? input.currentUser!.id : null,
      nextPath: input.intent === "link" ? "/account/connections" : safeSocialNextPath(input.nextPath),
      codeVerifier, nonce, expiresAtUtc,
      termsVersion: input.intent === "register" ? getCurrentTermsVersion() : null
    }
  });
  return { state, browserToken, codeVerifier, nonce, expiresAtUtc };
}

export async function consumeSocialAttempt(provider: SocialProvider, state: string, browserToken: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(state) || !/^[A-Za-z0-9_-]{43}$/u.test(browserToken)) throw new SocialAuthError("social_expired");
  return prisma.$transaction(async (tx) => {
    const stateHash = hashOpaqueToken(state);
    const browserTokenHash = hashOpaqueToken(browserToken);
    const attempt = await tx.socialLoginAttempt.findUnique({ where: { stateHash } });
    if (!attempt || attempt.provider !== provider || attempt.browserTokenHash !== browserTokenHash || attempt.expiresAtUtc.getTime() <= Date.now()) throw new SocialAuthError("social_expired");
    const removed = await tx.socialLoginAttempt.deleteMany({ where: { stateHash, browserTokenHash, expiresAtUtc: { gt: new Date() } } });
    if (removed.count !== 1) throw new SocialAuthError("social_expired");
    return attempt;
  });
}

export async function resolveSocialIdentity(input: {
  identity: SocialIdentity;
  intent: string;
  linkedUserId: string | null;
  currentUser: AuthenticatedUser | null;
  termsVersion: string | null;
}) {
  const { identity } = input;
  if (input.intent === "link" && (!input.currentUser || !input.currentUser.emailVerifiedAtUtc || input.linkedUserId !== input.currentUser.id)) throw new SocialAuthError("social_verify_first");
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.socialAccount.findUnique({
        where: { provider_providerAccountId: { provider: identity.provider, providerAccountId: identity.providerAccountId } },
        select: { user: { select: authUserSelect } }
      });
      if (existing) {
        if (input.intent === "link" && existing.user.id !== input.linkedUserId) throw new SocialAuthError("social_already_connected");
        return { user: existing.user, created: false };
      }
      if (input.intent === "link") {
        await tx.socialAccount.create({ data: { userId: input.linkedUserId!, provider: identity.provider, providerAccountId: identity.providerAccountId } });
        return { user: input.currentUser!, created: false };
      }
      if (input.intent !== "register") throw new SocialAuthError("social_registration_required");
      if (!input.termsVersion || input.termsVersion !== getCurrentTermsVersion()) throw new SocialAuthError("terms_required");
      if (!identity.email || identity.email.length > 320 || !isValidEmail(identity.email)) throw new SocialAuthError("social_email_required");
      const normalizedEmail = normalizeEmail(identity.email);
      const collision = await tx.user.findUnique({ where: { normalizedEmail }, select: { id: true } });
      // Matching emails never link an existing account, including verified Google addresses.
      if (collision) throw new SocialAuthError("social_email_exists");
      const user = await tx.user.create({
        data: {
          email: identity.email, normalizedEmail, displayName: identity.displayName,
          role: "bidder", acceptedTermsVersion: input.termsVersion, acceptedTermsAtUtc: new Date(),
          emailVerifiedAtUtc: identity.emailVerified ? new Date() : null,
          bidderProfile: { create: { maxBidTier: "tier_0", activeHoldAmountCents: 0, isBlocked: false, nonPaymentStrikeCount: 0 } },
          socialAccounts: { create: { provider: identity.provider, providerAccountId: identity.providerAccountId } }
        },
        select: authUserSelect
      });
      return { user, created: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new SocialAuthError("social_already_connected");
    throw error;
  }
}

export async function disconnectSocialAccount(userId: string, provider: SocialProvider) {
  const enabledProviders = getEnabledSocialProviders();
  // Serializable isolation prevents two simultaneous removals from each treating
  // the other social identity as the account's remaining login method.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, socialAccounts: { select: { provider: true } } }
    });
    if (!user) throw new SocialAuthError("social_verify_first");
    if (!user.socialAccounts.some((account) => account.provider === provider)) return;
    const anotherProvider = user.socialAccounts.some((account) => account.provider !== provider && enabledProviders.some((enabled) => enabled === account.provider));
    if (!user.passwordHash && !anotherProvider) throw new SocialAuthError("social_last_method");
    await tx.socialAccount.deleteMany({ where: { userId, provider } });
    await tx.socialLoginAttempt.deleteMany({ where: { userId, provider, intent: "link" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const socialAuthMessages: Record<string, string> = {
  social_disabled: "This sign-in option has not been connected yet. Please use email and password.",
  social_failed: "We could not complete that sign-in. Please try again or use email and password.",
  social_cancelled: "Sign-in was cancelled. You can try again when you are ready.",
  social_expired: "That sign-in attempt expired or was already used. Please start again.",
  social_registration_required: "This social account is not connected yet. Register with Google or Facebook, or log in with your existing email and connect it under Account → Sign-in methods.",
  social_email_exists: "An account already uses that email. Log in with your existing method, then connect Google or Facebook under Account → Sign-in methods.",
  social_email_required: "This provider did not share an email address. Register using your email first, verify it, then connect this provider under Sign-in methods.",
  social_verify_first: "Log in and verify your email before connecting a sign-in method.",
  social_already_connected: "This sign-in method is already connected to an account. Use its existing login or choose a different account.",
  social_last_method: "Keep at least one working sign-in method. Connect another available provider before disconnecting this one, or contact support for help removing your account data.",
  social_disconnect_confirm: "Confirm that you want to disconnect this sign-in method.",
  terms_required: "Accept the terms before registering with Google or Facebook.",
  too_many_attempts: "Too many attempts. Wait a few minutes before trying again."
};
