import { AppEnvError } from "./env-error";

export const DEFAULT_DIDIT_BASE_URL = "https://verification.didit.me";

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_PERSONA_SUBDOMAIN = "inquiry";

export type IdentityVerificationProvider = "disabled" | "didit" | "persona";

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

export function parseIdentityVerificationProvider(
  source: EnvSource
): IdentityVerificationProvider {
  const value = readTrimmed(source, "IDENTITY_VERIFICATION_PROVIDER");

  if (!value) {
    return "disabled";
  }

  if (value === "disabled" || value === "didit" || value === "persona") {
    return value;
  }

  throw new AppEnvError(
    "IDENTITY_VERIFICATION_PROVIDER must be set to 'disabled', 'didit', or 'persona'.",
    "IDENTITY_VERIFICATION_PROVIDER"
  );
}

export function getIdentityVerificationEnv(source: EnvSource = process.env) {
  const nodeEnv = parseRuntimeEnvironment(readTrimmed(source, "NODE_ENV"));
  const isProduction = nodeEnv === "production";
  const appUrl = readTrimmed(source, "APP_URL") ?? DEFAULT_APP_URL;
  const diditBaseUrl = readTrimmed(source, "DIDIT_BASE_URL") ?? DEFAULT_DIDIT_BASE_URL;

  assertValidUrl(appUrl, "APP_URL", isProduction);
  assertValidUrl(diditBaseUrl, "DIDIT_BASE_URL", isProduction);

  return {
    runtime: {
      nodeEnv,
      isProduction
    },
    app: {
      url: appUrl
    },
    identityVerification: {
      provider: parseIdentityVerificationProvider(source)
    },
    didit: {
      apiKey: readTrimmed(source, "DIDIT_API_KEY"),
      workflowId: readTrimmed(source, "DIDIT_WORKFLOW_ID"),
      webhookSecret: readTrimmed(source, "DIDIT_WEBHOOK_SECRET"),
      baseUrl: diditBaseUrl
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

export function isActiveIdentityProviderConfigured(
  env = getIdentityVerificationEnv()
) {
  if (env.identityVerification.provider === "didit") {
    return Boolean(env.didit.apiKey && env.didit.workflowId);
  }

  if (env.identityVerification.provider === "persona") {
    return Boolean(env.persona.templateId);
  }

  return false;
}

export function requireDiditSessionConfig(env = getIdentityVerificationEnv()) {
  if (env.identityVerification.provider !== "didit") {
    throw new AppEnvError(
      "IDENTITY_VERIFICATION_PROVIDER must be set to 'didit' before starting Didit sessions.",
      "IDENTITY_VERIFICATION_PROVIDER"
    );
  }

  if (!env.didit.apiKey) {
    throw new AppEnvError(
      "DIDIT_API_KEY is required when IDENTITY_VERIFICATION_PROVIDER=didit.",
      "DIDIT_API_KEY"
    );
  }

  if (!env.didit.workflowId) {
    throw new AppEnvError(
      "DIDIT_WORKFLOW_ID is required when IDENTITY_VERIFICATION_PROVIDER=didit.",
      "DIDIT_WORKFLOW_ID"
    );
  }

  return {
    apiKey: env.didit.apiKey,
    baseUrl: env.didit.baseUrl,
    workflowId: env.didit.workflowId
  };
}

export function requireDiditWebhookSecret(env = getIdentityVerificationEnv()) {
  if (!env.didit.webhookSecret) {
    throw new AppEnvError(
      "DIDIT_WEBHOOK_SECRET is required to verify Didit webhooks.",
      "DIDIT_WEBHOOK_SECRET"
    );
  }

  return env.didit.webhookSecret;
}
