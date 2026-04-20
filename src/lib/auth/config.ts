const DEFAULT_AUTH_SECRET = "dev-only-secret-change-me";

function parseHours(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  return DEFAULT_AUTH_SECRET;
}

export function getAuthCookieName() {
  return process.env.AUTH_SESSION_COOKIE_NAME?.trim() || "layu_session";
}

export function getCurrentTermsVersion() {
  return process.env.TERMS_VERSION?.trim() || "v1";
}

export function getSessionTtlHours() {
  return parseHours(process.env.AUTH_SESSION_TTL_HOURS, 24 * 30);
}

export function getEmailVerificationTtlHours() {
  return parseHours(process.env.AUTH_EMAIL_VERIFICATION_TTL_HOURS, 24);
}

export function getPasswordResetTtlHours() {
  return parseHours(process.env.AUTH_PASSWORD_RESET_TTL_HOURS, 2);
}
