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
});
