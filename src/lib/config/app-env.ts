import { AppEnvError } from "./env-error";
import {
  DEFAULT_DIDIT_BASE_URL,
  parseIdentityVerificationProvider,
  type IdentityVerificationProvider
} from "./identity-verification-env";

export { AppEnvError } from "./env-error";

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_LOCAL_STORAGE_DIR = ".local/uploads";
const DEFAULT_LOCAL_PUBLIC_BASE_URL = "http://localhost:3000/uploads";
const DEFAULT_AUTH_SECRET = "dev-only-secret-change-me";
const DEFAULT_EMAIL_FROM = "dev@localhost";
const DEFAULT_PERSONA_SUBDOMAIN = "inquiry";

type EnvSource = Record<string, string | undefined>;
type RuntimeEnvironment = "development" | "test" | "production";
type EmailDriver = "console" | "ses" | "webhook";
type StorageDriver = "local" | "object";

export type AppEnv = {
  runtime: {
    nodeEnv: RuntimeEnvironment;
    isDevelopment: boolean;
    isTest: boolean;
    isProduction: boolean;
  };
  app: {
    url: string;
  };
  database: {
    url: string | null;
  };
  auth: {
    secret: string;
    sessionCookieName: string;
    sessionCookieDomain: string | null;
    currentTermsVersion: string;
    sessionTtlHours: number;
    emailVerificationTtlHours: number;
    passwordResetTtlHours: number;
  };
  jobs: {
    internalSecret: string | null;
  };
  identityVerification: {
    provider: IdentityVerificationProvider;
  };
  didit: {
    apiKey: string | null;
    workflowId: string | null;
    webhookSecret: string | null;
    baseUrl: string;
  };
  persona: {
    templateId: string | null;
    environmentId: string | null;
    subdomain: string;
    webhookSecret: string | null;
  };
  email: {
    driver: EmailDriver;
    fromAddress: string | null;
    replyToAddress: string | null;
    webhookUrl: string | null;
    webhookBearerToken: string | null;
    sesRegion: string | null;
    smtp: {
      host: string | null;
      port: number | null;
      user: string | null;
      password: string | null;
      fromAddress: string | null;
    };
  };
  storage: {
    driver: StorageDriver;
    local: {
      uploadDir: string;
      publicBaseUrl: string;
    };
    object: {
      bucket: string | null;
      region: string | null;
      endpoint: string | null;
      accessKeyId: string | null;
      secretAccessKey: string | null;
      publicBaseUrl: string | null;
      forcePathStyle: boolean;
    };
  };
};

let cachedAppEnv: AppEnv | null = null;

function readTrimmed(source: EnvSource, key: string) {
  const value = source[key]?.trim();

  return value ? value : null;
}

function hasExplicitValue(source: EnvSource, key: string) {
  return Boolean(readTrimmed(source, key));
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

function parseHours(
  source: EnvSource,
  key: string,
  fallback: number
) {
  const value = readTrimmed(source, key);
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseOptionalPort(source: EnvSource, key: string) {
  const value = readTrimmed(source, key);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new AppEnvError(`${key} must be a valid TCP port.`, key);
  }

  return parsed;
}

function parseBoolean(source: EnvSource, key: string, fallback: boolean) {
  const value = readTrimmed(source, key);

  if (!value) {
    return fallback;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new AppEnvError(`${key} must be a boolean value.`, key);
  }
}

function parseEmailDriver(source: EnvSource): EmailDriver {
  const value = readTrimmed(source, "EMAIL_DRIVER");

  if (!value) {
    return "console";
  }

  if (value === "console" || value === "ses" || value === "webhook") {
    return value;
  }

  throw new AppEnvError(
    "EMAIL_DRIVER must be set to 'console', 'ses', or 'webhook'.",
    "EMAIL_DRIVER"
  );
}

function parseStorageDriver(source: EnvSource): StorageDriver {
  const value = readTrimmed(source, "STORAGE_DRIVER");

  if (!value) {
    return "local";
  }

  if (value === "local" || value === "object") {
    return value;
  }

  throw new AppEnvError(
    "STORAGE_DRIVER must be set to either 'local' or 'object'.",
    "STORAGE_DRIVER"
  );
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

function isLikelyPlaceholderSecret(value: string) {
  return /change|replace|example|placeholder|secret_here/i.test(value) || value.length < 32;
}

function requireProductionSafeSecret(value: string | null, key: string) {
  if (!value) {
    throw new AppEnvError(`${key} is required in production.`, key);
  }

  if (isLikelyPlaceholderSecret(value)) {
    throw new AppEnvError(
      `${key} must be replaced with a long random secret before production deployment.`,
      key
    );
  }

  return value;
}

function requireConfiguredSecret(value: string | null, key: string, message: string) {
  if (!value) {
    throw new AppEnvError(message, key);
  }

  return value;
}

export function parseAppEnv(source: EnvSource = process.env): AppEnv {
  const nodeEnv = parseRuntimeEnvironment(readTrimmed(source, "NODE_ENV"));
  const isProduction = nodeEnv === "production";
  const appUrl = readTrimmed(source, "APP_URL") ?? DEFAULT_APP_URL;

  assertValidUrl(appUrl, "APP_URL", isProduction);

  const authSecret =
    readTrimmed(source, "NEXTAUTH_SECRET") ??
    (isProduction ? null : DEFAULT_AUTH_SECRET);
  const internalJobSecret = readTrimmed(source, "INTERNAL_JOB_SECRET");

  if (isProduction) {
    requireProductionSafeSecret(authSecret, "NEXTAUTH_SECRET");
    requireProductionSafeSecret(internalJobSecret, "INTERNAL_JOB_SECRET");
  }

  const emailDriver = parseEmailDriver(source);
  const storageDriver = parseStorageDriver(source);
  const localPublicBaseUrl =
    readTrimmed(source, "LOCAL_PUBLIC_UPLOAD_BASE_URL") ?? DEFAULT_LOCAL_PUBLIC_BASE_URL;

  assertValidUrl(
    localPublicBaseUrl,
    "LOCAL_PUBLIC_UPLOAD_BASE_URL",
    isProduction && storageDriver === "local"
  );

  const webhookUrl = readTrimmed(source, "EMAIL_WEBHOOK_URL");

  if (webhookUrl) {
    assertValidUrl(webhookUrl, "EMAIL_WEBHOOK_URL", isProduction);
  }

  const objectEndpoint = readTrimmed(source, "OBJECT_STORAGE_ENDPOINT");

  if (objectEndpoint) {
    assertValidUrl(objectEndpoint, "OBJECT_STORAGE_ENDPOINT", isProduction);
  }

  const objectPublicBaseUrl = readTrimmed(source, "OBJECT_STORAGE_PUBLIC_BASE_URL");

  if (objectPublicBaseUrl) {
    assertValidUrl(
      objectPublicBaseUrl,
      "OBJECT_STORAGE_PUBLIC_BASE_URL",
      isProduction
    );
  }

  const diditBaseUrl = readTrimmed(source, "DIDIT_BASE_URL") ?? DEFAULT_DIDIT_BASE_URL;

  assertValidUrl(diditBaseUrl, "DIDIT_BASE_URL", isProduction);

  return {
    runtime: {
      nodeEnv,
      isDevelopment: nodeEnv === "development",
      isTest: nodeEnv === "test",
      isProduction
    },
    app: {
      url: appUrl
    },
    database: {
      url: readTrimmed(source, "DATABASE_URL")
    },
    auth: {
      secret: authSecret ?? DEFAULT_AUTH_SECRET,
      sessionCookieName:
        readTrimmed(source, "AUTH_SESSION_COOKIE_NAME") ?? "layu_session",
      sessionCookieDomain: readTrimmed(source, "AUTH_COOKIE_DOMAIN"),
      currentTermsVersion: readTrimmed(source, "TERMS_VERSION") ?? "v1",
      sessionTtlHours: parseHours(source, "AUTH_SESSION_TTL_HOURS", 24 * 30),
      emailVerificationTtlHours: parseHours(
        source,
        "AUTH_EMAIL_VERIFICATION_TTL_HOURS",
        24
      ),
      passwordResetTtlHours: parseHours(
        source,
        "AUTH_PASSWORD_RESET_TTL_HOURS",
        2
      )
    },
    jobs: {
      internalSecret: internalJobSecret
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
      subdomain: readTrimmed(source, "PERSONA_SUBDOMAIN") ?? DEFAULT_PERSONA_SUBDOMAIN,
      webhookSecret: readTrimmed(source, "PERSONA_WEBHOOK_SECRET")
    },
    email: {
      driver: emailDriver,
      fromAddress:
        readTrimmed(source, "EMAIL_FROM") ??
        readTrimmed(source, "SMTP_FROM") ??
        (isProduction ? null : DEFAULT_EMAIL_FROM),
      replyToAddress: readTrimmed(source, "EMAIL_REPLY_TO"),
      webhookUrl,
      webhookBearerToken: readTrimmed(source, "EMAIL_WEBHOOK_BEARER_TOKEN"),
      sesRegion: readTrimmed(source, "AWS_SES_REGION"),
      smtp: {
        host: readTrimmed(source, "SMTP_HOST"),
        port: parseOptionalPort(source, "SMTP_PORT"),
        user: readTrimmed(source, "SMTP_USER"),
        password: readTrimmed(source, "SMTP_PASSWORD"),
        fromAddress: readTrimmed(source, "SMTP_FROM")
      }
    },
    storage: {
      driver: storageDriver,
      local: {
        uploadDir: readTrimmed(source, "LOCAL_UPLOAD_DIR") ?? DEFAULT_LOCAL_STORAGE_DIR,
        publicBaseUrl: localPublicBaseUrl
      },
      object: {
        bucket: readTrimmed(source, "OBJECT_STORAGE_BUCKET"),
        region: readTrimmed(source, "OBJECT_STORAGE_REGION"),
        endpoint: objectEndpoint,
        accessKeyId: readTrimmed(source, "OBJECT_STORAGE_ACCESS_KEY_ID"),
        secretAccessKey: readTrimmed(source, "OBJECT_STORAGE_SECRET_ACCESS_KEY"),
        publicBaseUrl: objectPublicBaseUrl,
        forcePathStyle: parseBoolean(
          source,
          "OBJECT_STORAGE_FORCE_PATH_STYLE",
          true
        )
      }
    }
  };
}

export function getAppEnv(): AppEnv {
  cachedAppEnv ??= parseAppEnv();

  return cachedAppEnv;
}

export function resetAppEnvForTests() {
  cachedAppEnv = null;
}

export function getAuthSecret() {
  return getAppEnv().auth.secret;
}

export function getInternalJobSecret() {
  return getAppEnv().jobs.internalSecret;
}

export function requireInternalJobSecret() {
  const env = getAppEnv();
  const secret = requireConfiguredSecret(
    getInternalJobSecret(),
    "INTERNAL_JOB_SECRET",
    "INTERNAL_JOB_SECRET must be configured before internal job endpoints are exposed."
  );

  if (env.runtime.isProduction && isLikelyPlaceholderSecret(secret)) {
    throw new AppEnvError(
      "INTERNAL_JOB_SECRET must be replaced with a long random secret before production deployment.",
      "INTERNAL_JOB_SECRET"
    );
  }

  return secret;
}

export function requireWebhookEmailConfig(env: AppEnv = getAppEnv()) {
  if (env.email.driver !== "webhook") {
    throw new AppEnvError(
      "EMAIL_DRIVER must be set to 'webhook' before using webhook email delivery.",
      "EMAIL_DRIVER"
    );
  }

  if (!env.email.webhookUrl) {
    throw new AppEnvError(
      "EMAIL_WEBHOOK_URL is required when EMAIL_DRIVER=webhook.",
      "EMAIL_WEBHOOK_URL"
    );
  }

  if (!env.email.fromAddress) {
    throw new AppEnvError(
      "EMAIL_FROM is required when EMAIL_DRIVER=webhook.",
      "EMAIL_FROM"
    );
  }

  const fromAddress = env.email.fromAddress;
  const webhookUrl = env.email.webhookUrl;

  return {
    fromAddress,
    replyToAddress: env.email.replyToAddress,
    webhookBearerToken: env.email.webhookBearerToken,
    webhookUrl
  };
}

export function requireSesEmailConfig(env: AppEnv = getAppEnv()) {
  if (env.email.driver !== "ses") {
    throw new AppEnvError(
      "EMAIL_DRIVER must be set to 'ses' before using Amazon SES email delivery.",
      "EMAIL_DRIVER"
    );
  }

  if (!env.email.sesRegion) {
    throw new AppEnvError(
      "AWS_SES_REGION is required when EMAIL_DRIVER=ses.",
      "AWS_SES_REGION"
    );
  }

  if (!env.email.fromAddress) {
    throw new AppEnvError(
      "EMAIL_FROM is required when EMAIL_DRIVER=ses.",
      "EMAIL_FROM"
    );
  }

  return {
    fromAddress: env.email.fromAddress,
    region: env.email.sesRegion,
    replyToAddress: env.email.replyToAddress
  };
}

export function requireObjectStorageConfig(env: AppEnv = getAppEnv()) {
  if (env.storage.driver !== "object") {
    throw new AppEnvError(
      "STORAGE_DRIVER must be set to 'object' before using object storage.",
      "STORAGE_DRIVER"
    );
  }

  const requiredFields = {
    OBJECT_STORAGE_BUCKET: env.storage.object.bucket,
    OBJECT_STORAGE_REGION: env.storage.object.region,
    OBJECT_STORAGE_ENDPOINT: env.storage.object.endpoint,
    OBJECT_STORAGE_ACCESS_KEY_ID: env.storage.object.accessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: env.storage.object.secretAccessKey
  } as const;

  for (const [key, value] of Object.entries(requiredFields)) {
    if (!value) {
      throw new AppEnvError(
        `${key} is required when STORAGE_DRIVER=object.`,
        key
      );
    }
  }

  const accessKeyId = env.storage.object.accessKeyId as string;
  const bucket = env.storage.object.bucket as string;
  const endpoint = env.storage.object.endpoint as string;
  const region = env.storage.object.region as string;
  const secretAccessKey = env.storage.object.secretAccessKey as string;

  return {
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle: env.storage.object.forcePathStyle,
    publicBaseUrl: env.storage.object.publicBaseUrl,
    region,
    secretAccessKey
  };
}

export function requireProductionOperationalEnv(source: EnvSource = process.env) {
  const nodeEnv = parseRuntimeEnvironment(readTrimmed(source, "NODE_ENV"));

  if (nodeEnv !== "production") {
    return parseAppEnv(source);
  }

  if (!hasExplicitValue(source, "APP_URL")) {
    throw new AppEnvError(
      "APP_URL must be set explicitly before a production deployment.",
      "APP_URL"
    );
  }

  if (!hasExplicitValue(source, "DATABASE_URL")) {
    throw new AppEnvError(
      "DATABASE_URL is required before a production deployment.",
      "DATABASE_URL"
    );
  }

  const storageDriver = readTrimmed(source, "STORAGE_DRIVER") ?? "local";

  if (storageDriver === "object" && !hasExplicitValue(source, "OBJECT_STORAGE_PUBLIC_BASE_URL")) {
    throw new AppEnvError(
      "OBJECT_STORAGE_PUBLIC_BASE_URL is required when STORAGE_DRIVER=object in production so public listing media resolves correctly.",
      "OBJECT_STORAGE_PUBLIC_BASE_URL"
    );
  }

  if (storageDriver === "local") {
    if (!hasExplicitValue(source, "LOCAL_UPLOAD_DIR")) {
      throw new AppEnvError(
        "LOCAL_UPLOAD_DIR must be set explicitly when STORAGE_DRIVER=local in production.",
        "LOCAL_UPLOAD_DIR"
      );
    }

    if (!hasExplicitValue(source, "LOCAL_PUBLIC_UPLOAD_BASE_URL")) {
      throw new AppEnvError(
        "LOCAL_PUBLIC_UPLOAD_BASE_URL must be set explicitly when STORAGE_DRIVER=local in production.",
        "LOCAL_PUBLIC_UPLOAD_BASE_URL"
      );
    }
  }

  const env = parseAppEnv(source);

  requireProductionSafeSecret(env.auth.secret, "NEXTAUTH_SECRET");
  requireProductionSafeSecret(env.jobs.internalSecret, "INTERNAL_JOB_SECRET");

  if (env.email.driver !== "ses" && env.email.driver !== "webhook") {
    throw new AppEnvError(
      "Production deployments must use EMAIL_DRIVER=ses or EMAIL_DRIVER=webhook.",
      "EMAIL_DRIVER"
    );
  }

  if (env.email.driver === "ses") {
    requireSesEmailConfig(env);
  } else {
    requireWebhookEmailConfig(env);
  }

  if (env.storage.driver === "object") {
    requireObjectStorageConfig(env);
  }

  if (env.identityVerification.provider === "disabled") {
    throw new AppEnvError(
      "IDENTITY_VERIFICATION_PROVIDER must be set to 'didit' or 'persona' before production deployment.",
      "IDENTITY_VERIFICATION_PROVIDER"
    );
  }

  if (env.identityVerification.provider === "didit") {
    const requiredDiditFields = {
      DIDIT_API_KEY: env.didit.apiKey,
      DIDIT_WORKFLOW_ID: env.didit.workflowId,
      DIDIT_WEBHOOK_SECRET: env.didit.webhookSecret
    } as const;

    for (const [key, value] of Object.entries(requiredDiditFields)) {
      if (!value) {
        throw new AppEnvError(
          `${key} is required when IDENTITY_VERIFICATION_PROVIDER=didit in production.`,
          key
        );
      }
    }
  }

  if (env.identityVerification.provider === "persona" && !env.persona.templateId) {
    throw new AppEnvError(
      "PERSONA_TEMPLATE_ID is required when IDENTITY_VERIFICATION_PROVIDER=persona in production.",
      "PERSONA_TEMPLATE_ID"
    );
  }

  if (env.identityVerification.provider === "persona" && !env.persona.webhookSecret) {
    throw new AppEnvError(
      "PERSONA_WEBHOOK_SECRET must be set before enabling Persona in production.",
      "PERSONA_WEBHOOK_SECRET"
    );
  }

  return env;
}
