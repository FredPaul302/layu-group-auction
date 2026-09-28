import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDeploymentCheckReport } from "../scripts/check-deployment.js";
import { mergeLocalEnvFiles } from "../src/lib/config/local-env-files.js";

function createProductionEnv(
  overrides: Record<string, string | undefined> = {}
) {
  return {
    NODE_ENV: "production",
    APP_URL: "https://auction.example.com",
    DATABASE_URL: "postgresql://auction:secret@example.com/auction",
    NEXTAUTH_SECRET: "12345678901234567890123456789012",
    EMAIL_DRIVER: "webhook",
    EMAIL_FROM: "ops@auction.example.com",
    EMAIL_WEBHOOK_URL: "https://mail-bridge.example.com/send",
    STORAGE_DRIVER: "local",
    LOCAL_UPLOAD_DIR: "/srv/auction/uploads",
    LOCAL_PUBLIC_UPLOAD_BASE_URL: "https://auction.example.com/uploads",
    IDENTITY_VERIFICATION_PROVIDER: "didit",
    DIDIT_API_KEY: "didit_api_key",
    DIDIT_WORKFLOW_ID: "didit_workflow_id",
    DIDIT_WEBHOOK_SECRET: "didit_webhook_secret",
    ...overrides
  };
}

describe("deploy check", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, {
        force: true,
        recursive: true
      });
    }
  });

  it("loads .env first and lets .env.local override it", () => {
    const cwd = mkdtempSync(join(tmpdir(), "layu-deploy-check-"));
    tempDirs.push(cwd);

    writeFileSync(
      join(cwd, ".env"),
      [
        "NEXTAUTH_SECRET=12345678901234567890123456789012",
        "INTERNAL_JOB_SECRET=abcdefghijklmnopqrstuvwxyz123456"
      ].join("\n")
    );
    writeFileSync(
      join(cwd, ".env.local"),
      "INTERNAL_JOB_SECRET=override-secret-abcdefghijklmnopqrstuvwxyz123456"
    );

    const merged = mergeLocalEnvFiles(
      {
        NEXTAUTH_SECRET: "",
        INTERNAL_JOB_SECRET: ""
      },
      cwd
    );

    expect(merged.NEXTAUTH_SECRET).toBe("12345678901234567890123456789012");
    expect(merged.INTERNAL_JOB_SECRET).toBe(
      "override-secret-abcdefghijklmnopqrstuvwxyz123456"
    );
  });

  it("reports internal jobs as configured when INTERNAL_JOB_SECRET is present", () => {
    const report = getDeploymentCheckReport(
      createProductionEnv({
        INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456"
      })
    );

    expect(report.status).toBe("ok");
    expect(report.identityVerificationProvider).toBe("didit");
    expect(report.diditConfigured).toBe(true);
    expect(report.internalJobsConfigured).toBe(true);
  });

  it("fails production readiness when INTERNAL_JOB_SECRET is missing", () => {
    expect(() =>
      getDeploymentCheckReport(createProductionEnv())
    ).toThrow(/INTERNAL_JOB_SECRET/);
  });

  it("keeps AI optional and reports only configuration booleans", () => {
    const report = getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456"
    }));

    expect(report.aiListingDescriptionsEnabled).toBe(false);
    expect(report.openAiApiKeyConfigured).toBe(false);
  });

  it.each([undefined, "", "   "])("fails readiness when AI is enabled without a usable server key", (key) => {
    expect(() => getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AI_LISTING_DESCRIPTIONS_ENABLED: "true",
      OPENAI_API_KEY: key
    }))).toThrow(/OPENAI_API_KEY must be configured as a server secret/);
  });

  it.each([
    { flag: "true", enabled: true },
    { flag: "false", enabled: false },
    { flag: "TRUE", enabled: false },
    { flag: undefined, enabled: false }
  ])("reports AI opt-in without exposing the configured key: %o", ({ flag, enabled }) => {
    const key = "unit-test-openai-project-key";
    const report = getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AI_LISTING_DESCRIPTIONS_ENABLED: flag,
      OPENAI_API_KEY: key
    }));

    expect(report.aiListingDescriptionsEnabled).toBe(enabled);
    expect(report.openAiApiKeyConfigured).toBe(true);
    expect(JSON.stringify(report)).not.toContain(key);
  });

  it("enables Gemini using only its selected server key", () => {
    const key = "unit-test-gemini-authorization-key";
    const report = getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AI_LISTING_DESCRIPTIONS_ENABLED: "true",
      AI_LISTING_DESCRIPTIONS_PROVIDER: "gemini",
      GEMINI_API_KEY: key
    }));

    expect(report.aiListingDescriptionsEnabled).toBe(true);
    expect(report.aiListingDescriptionsProvider).toBe("gemini");
    expect(report.geminiApiKeyConfigured).toBe(true);
    expect(report.openAiApiKeyConfigured).toBe(false);
    expect(JSON.stringify(report)).not.toContain(key);
  });

  it("does not substitute an OpenAI key when Gemini was selected", () => {
    expect(() => getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AI_LISTING_DESCRIPTIONS_ENABLED: "true",
      AI_LISTING_DESCRIPTIONS_PROVIDER: "gemini",
      OPENAI_API_KEY: "unit-test-other-provider-key"
    }))).toThrow(/GEMINI_API_KEY must be configured as a server secret/);
  });

  it("rejects an unknown enabled provider without echoing its value", () => {
    const provider = "untrusted-provider-value";
    expect(() => getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AI_LISTING_DESCRIPTIONS_ENABLED: "true",
      AI_LISTING_DESCRIPTIONS_PROVIDER: provider,
      OPENAI_API_KEY: "unit-test-openai-key"
    }))).toThrow("AI_LISTING_DESCRIPTIONS_PROVIDER must be openai or gemini when AI_LISTING_DESCRIPTIONS_ENABLED=true.");
  });

  it("keeps social login optional unless explicitly enabled", () => {
    const report = getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      GOOGLE_LOGIN_ENABLED: "false",
      FACEBOOK_LOGIN_ENABLED: "TRUE"
    }));
    expect(report.googleLoginEnabled).toBe(false);
    expect(report.facebookLoginEnabled).toBe(false);
  });

  it.each([
    { provider: "GOOGLE", field: "CLIENT_ID", value: undefined },
    { provider: "GOOGLE", field: "CLIENT_SECRET", value: "   " },
    { provider: "FACEBOOK", field: "CLIENT_ID", value: "" },
    { provider: "FACEBOOK", field: "CLIENT_SECRET", value: undefined },
    { provider: "FACEBOOK", field: "GRAPH_API_VERSION", value: undefined },
    { provider: "FACEBOOK", field: "GRAPH_API_VERSION", value: "secret-looking-invalid-version" }
  ])("rejects explicitly enabled $provider with unusable $field", ({ provider, field, value }) => {
    const secret = "private-social-server-secret";
    let failure: unknown;
    try {
      getDeploymentCheckReport(createProductionEnv({
        INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
        [`${provider}_LOGIN_ENABLED`]: "true",
        [`${provider}_CLIENT_ID`]: "unit-test-client-id",
        [`${provider}_CLIENT_SECRET`]: secret,
        FACEBOOK_GRAPH_API_VERSION: "v22.0",
        [`${provider}_${field}`]: value
      }));
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(`${provider}_LOGIN_ENABLED=true`);
    expect((failure as Error).message).not.toContain(secret);
    expect((failure as Error).message).not.toContain("secret-looking-invalid-version");
  });

  it("reports enabled social providers without exposing IDs or secrets", () => {
    const report = getDeploymentCheckReport(createProductionEnv({
      INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      GOOGLE_LOGIN_ENABLED: "true",
      GOOGLE_CLIENT_ID: "private-google-client-id",
      GOOGLE_CLIENT_SECRET: "private-google-client-secret",
      FACEBOOK_LOGIN_ENABLED: "true",
      FACEBOOK_CLIENT_ID: "private-facebook-client-id",
      FACEBOOK_CLIENT_SECRET: "private-facebook-client-secret",
      FACEBOOK_GRAPH_API_VERSION: "v22.0"
    }));
    expect(report.googleLoginEnabled).toBe(true);
    expect(report.facebookLoginEnabled).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private-google");
    expect(JSON.stringify(report)).not.toContain("private-facebook");
  });
  it("validates review-only Facebook credentials and reports public access separately", () => {
    const source = createProductionEnv({ INTERNAL_JOB_SECRET: "abcdefghijklmnopqrstuvwxyz123456", FACEBOOK_LOGIN_ENABLED: "false", FACEBOOK_LOGIN_REVIEW_ENABLED: "true", FACEBOOK_CLIENT_ID: "review-client", FACEBOOK_CLIENT_SECRET: "review-secret", FACEBOOK_GRAPH_API_VERSION: "v26.0" });
    expect(getDeploymentCheckReport(source)).toMatchObject({ facebookLoginEnabled: false, facebookLoginReviewEnabled: true });
    expect(() => getDeploymentCheckReport({ ...source, FACEBOOK_CLIENT_SECRET: "" })).toThrow("FACEBOOK_LOGIN_REVIEW_ENABLED=true");
    expect(() => getDeploymentCheckReport({ ...source, FACEBOOK_GRAPH_API_VERSION: "" })).toThrow("FACEBOOK_GRAPH_API_VERSION");
    expect(JSON.stringify(getDeploymentCheckReport(source))).not.toContain("review-secret");
  });
});
