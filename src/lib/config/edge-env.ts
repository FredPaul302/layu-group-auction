const DEFAULT_AUTH_SECRET = "dev-only-secret-change-me";
const DEFAULT_SESSION_COOKIE_NAME = "layu_session";

type EnvSource = Record<string, string | undefined>;
type RuntimeEnvironment = "development" | "test" | "production";

export class EdgeEnvError extends Error {
  constructor(
    message: string,
    public readonly key?: string
  ) {
    super(message);
    this.name = "EdgeEnvError";
  }
}

function readTrimmed(source: EnvSource, key: string) {
  const value = source[key]?.trim();

  return value ? value : null;
}

function parseRuntimeEnvironment(value: string | null): RuntimeEnvironment {
  switch (value) {
    case "production":
    case "test":
      return value;
    case "development":
    default:
      return "development";
  }
}

function isLikelyPlaceholderSecret(value: string) {
  return /change|replace|example|placeholder|secret_here/i.test(value) || value.length < 32;
}

function requireProductionSafeSecret(value: string | null, key: string) {
  if (!value) {
    throw new EdgeEnvError(`${key} is required in production.`, key);
  }

  if (isLikelyPlaceholderSecret(value)) {
    throw new EdgeEnvError(
      `${key} must be replaced with a long random secret before production deployment.`,
      key
    );
  }

  return value;
}

export function parseEdgeAuthEnv(source: EnvSource = process.env) {
  const nodeEnv = parseRuntimeEnvironment(readTrimmed(source, "NODE_ENV"));
  const isProduction = nodeEnv === "production";
  const secret =
    readTrimmed(source, "NEXTAUTH_SECRET") ??
    (isProduction ? null : DEFAULT_AUTH_SECRET);

  if (isProduction) {
    requireProductionSafeSecret(secret, "NEXTAUTH_SECRET");
  }

  return {
    auth: {
      secret: secret ?? DEFAULT_AUTH_SECRET,
      sessionCookieName:
        readTrimmed(source, "AUTH_SESSION_COOKIE_NAME") ?? DEFAULT_SESSION_COOKIE_NAME
    }
  };
}

let cachedEdgeAuthEnv: ReturnType<typeof parseEdgeAuthEnv> | null = null;

export function getEdgeAuthEnv() {
  cachedEdgeAuthEnv ??= parseEdgeAuthEnv();

  return cachedEdgeAuthEnv;
}

export function resetEdgeAuthEnvForTests() {
  cachedEdgeAuthEnv = null;
}

export function getEdgeAuthSecret() {
  return getEdgeAuthEnv().auth.secret;
}

export function getEdgeAuthCookieName() {
  return getEdgeAuthEnv().auth.sessionCookieName;
}
