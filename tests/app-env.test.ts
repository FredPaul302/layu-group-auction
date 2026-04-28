import { describe, expect, it } from "vitest";

import {
  AppEnvError,
  parseAppEnv,
  requireProductionOperationalEnv,
  requireObjectStorageConfig,
  requireWebhookEmailConfig
} from "../src/lib/config/app-env.js";

describe("app environment parsing", () => {
  it("provides safe development defaults", () => {
    const env = parseAppEnv({
      NODE_ENV: "development"
    });

    expect(env.app.url).toBe("http://localhost:3000");
    expect(env.auth.secret).toBe("dev-only-secret-change-me");
    expect(env.email.driver).toBe("console");
    expect(env.storage.driver).toBe("local");
    expect(env.storage.local.publicBaseUrl).toBe("http://localhost:3000/uploads");
  });

  it("rejects insecure production app URLs and placeholder secrets", () => {
    expect(() =>
      parseAppEnv({
        NODE_ENV: "production",
        APP_URL: "http://auction.example.com",
        LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
        NEXTAUTH_SECRET: "replace_with_secure_random_secret",
        INTERNAL_JOB_SECRET: "replace_with_internal_job_secret"
      })
    ).toThrow(AppEnvError);

    expect(() =>
      parseAppEnv({
        NODE_ENV: "production",
        APP_URL: "https://auction.example.com",
        LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
        NEXTAUTH_SECRET: "replace_with_secure_random_secret",
        INTERNAL_JOB_SECRET: "replace_with_internal_job_secret"
      })
    ).toThrow(/NEXTAUTH_SECRET/);
  });

  it("validates webhook email requirements only when the driver is enabled", () => {
    const env = parseAppEnv({
      NODE_ENV: "production",
      APP_URL: "https://auction.example.com",
      LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
      NEXTAUTH_SECRET: "12345678901234567890123456789012",
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      EMAIL_DRIVER: "webhook"
    });

    expect(() => requireWebhookEmailConfig(env)).toThrow(/EMAIL_WEBHOOK_URL/);

    const configuredEnv = parseAppEnv({
      NODE_ENV: "production",
      APP_URL: "https://auction.example.com",
      LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
      NEXTAUTH_SECRET: "12345678901234567890123456789012",
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      EMAIL_DRIVER: "webhook",
      EMAIL_FROM: "ops@auction.example.com",
      EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send"
    });

    expect(requireWebhookEmailConfig(configuredEnv)).toEqual({
      fromAddress: "ops@auction.example.com",
      replyToAddress: null,
      webhookBearerToken: null,
      webhookUrl: "https://mail-bridge.example.com/send"
    });
  });

  it("validates object storage requirements only when object storage is selected", () => {
    const env = parseAppEnv({
      NODE_ENV: "production",
      APP_URL: "https://auction.example.com",
      LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
      NEXTAUTH_SECRET: "12345678901234567890123456789012",
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      STORAGE_DRIVER: "object"
    });

    expect(() => requireObjectStorageConfig(env)).toThrow(/OBJECT_STORAGE_BUCKET/);
  });

  it("fails production readiness when APP_URL is not set explicitly", () => {
    expect(() =>
      requireProductionOperationalEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://auction:secret@example.com/auction",
        NEXTAUTH_SECRET: "12345678901234567890123456789012",
        INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
        EMAIL_DRIVER: "webhook",
        EMAIL_FROM: "ops@auction.example.com",
        EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send",
        STORAGE_DRIVER: "local",
        LOCAL_UPLOAD_DIR: "/srv/auction/uploads",
        LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads"
      })
    ).toThrow(/APP_URL/);
  });

  it("fails production readiness when DATABASE_URL is missing", () => {
    expect(() =>
      requireProductionOperationalEnv({
        NODE_ENV: "production",
        APP_URL: "https://auction.example.com",
        NEXTAUTH_SECRET: "12345678901234567890123456789012",
        INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
        EMAIL_DRIVER: "webhook",
        EMAIL_FROM: "ops@auction.example.com",
        EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send",
        STORAGE_DRIVER: "local",
        LOCAL_UPLOAD_DIR: "/srv/auction/uploads",
        LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads"
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("fails production readiness when object storage has no public base URL", () => {
    expect(() =>
      requireProductionOperationalEnv({
        NODE_ENV: "production",
        APP_URL: "https://auction.example.com",
        DATABASE_URL: "postgresql://auction:secret@example.com/auction",
        NEXTAUTH_SECRET: "12345678901234567890123456789012",
        INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
        EMAIL_DRIVER: "webhook",
        EMAIL_FROM: "ops@auction.example.com",
        EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send",
        STORAGE_DRIVER: "object",
        OBJECT_STORAGE_BUCKET: "auction-assets",
        OBJECT_STORAGE_REGION: "us-east-1",
        OBJECT_STORAGE_ENDPOINT: "https://object-storage.example.com",
        OBJECT_STORAGE_ACCESS_KEY_ID: "object_storage_access_key_here",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "object_storage_secret_here"
      })
    ).toThrow(/OBJECT_STORAGE_PUBLIC_BASE_URL/);
  });

  it("passes production readiness with explicit webhook email and object storage config", () => {
    const env = requireProductionOperationalEnv({
      NODE_ENV: "production",
      APP_URL: "https://auction.example.com",
      DATABASE_URL: "postgresql://auction:secret@example.com/auction",
      NEXTAUTH_SECRET: "12345678901234567890123456789012",
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      EMAIL_DRIVER: "webhook",
      EMAIL_FROM: "ops@auction.example.com",
      EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send",
      STORAGE_DRIVER: "object",
      OBJECT_STORAGE_BUCKET: "auction-assets",
      OBJECT_STORAGE_REGION: "us-east-1",
      OBJECT_STORAGE_ENDPOINT: "https://object-storage.example.com",
      OBJECT_STORAGE_ACCESS_KEY_ID: "object_storage_access_key_here",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "object_storage_secret_here",
      OBJECT_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com/auction-assets"
    });

    expect(env.app.url).toBe("https://auction.example.com");
    expect(env.storage.driver).toBe("object");
    expect(env.email.driver).toBe("webhook");
  });
});
