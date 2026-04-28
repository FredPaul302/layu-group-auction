import { getAppEnv, getAuthSecret as getConfiguredAuthSecret } from "@/lib/config/app-env";

export function getAuthSecret() {
  return getConfiguredAuthSecret();
}

export function getAuthCookieName() {
  return getAppEnv().auth.sessionCookieName;
}

export function getAuthCookieDomain() {
  return getAppEnv().auth.sessionCookieDomain;
}

export function getCurrentTermsVersion() {
  return getAppEnv().auth.currentTermsVersion;
}

export function getSessionTtlHours() {
  return getAppEnv().auth.sessionTtlHours;
}

export function getEmailVerificationTtlHours() {
  return getAppEnv().auth.emailVerificationTtlHours;
}

export function getPasswordResetTtlHours() {
  return getAppEnv().auth.passwordResetTtlHours;
}
