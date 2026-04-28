import { AppEnvError } from "./env-error";

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_PERSONA_SUBDOMAIN = "inquiry";

type EnvSource = Record<string, string | undefined>;
type RuntimeEnvironment = "development" | "test" | "production";

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

function assertValidUrl(value: string, key: string, requireHttps: boolean) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new AppEnvError(`${key} must be an absolute URL.`, key);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new AppEnvError(`${key} must use http or https.`, key);
  }

  if (requireHttps && parsedUrl.protocol !== "https:") {
    throw new AppEnvError(`${key} must use https in production.`, key);
  }
}

export function getPersonaEnv(source: EnvSource = process.env) {
  const nodeEnv = parseRuntimeEnvironment(readTrimmed(source, "NODE_ENV"));
  const isProduction = nodeEnv === "production";
  const appUrl = readTrimmed(source, "APP_URL") ?? DEFAULT_APP_URL;

  assertValidUrl(appUrl, "APP_URL", isProduction);

  return {
    runtime: {
      nodeEnv,
      isProduction
    },
    app: {
      url: appUrl
    },
    persona: {
      templateId: readTrimmed(source, "PERSONA_TEMPLATE_ID"),
      environmentId: readTrimmed(source, "PERSONA_ENVIRONMENT_ID"),
      subdomain:
        readTrimmed(source, "PERSONA_SUBDOMAIN") ?? DEFAULT_PERSONA_SUBDOMAIN,
      webhookSecret: readTrimmed(source, "PERSONA_WEBHOOK_SECRET")
    }
  };
}
