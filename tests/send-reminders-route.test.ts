import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appEnvMocks = vi.hoisted(() => {
  class MockAppEnvError extends Error {
    constructor(
      message: string,
      public readonly key?: string
    ) {
      super(message);
      this.name = "AppEnvError";
    }
  }

  return {
    AppEnvError: MockAppEnvError,
    getInternalJobSecret: vi.fn(() => "test-internal-secret"),
    requireInternalJobSecret: vi.fn(() => "test-internal-secret")
  };
});

const loggingMocks = vi.hoisted(() => ({
  logStructuredEvent: vi.fn(),
  serializeError: vi.fn((error: unknown) => ({
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : "Unknown error.",
    stack: null
  }))
}));

vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/lib/ops/structured-logging", () => loggingMocks);

import { POST } from "../src/app/api/internal/jobs/send-reminders/route.js";

describe("send-reminders internal job route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appEnvMocks.getInternalJobSecret.mockReturnValue("test-internal-secret");
    appEnvMocks.requireInternalJobSecret.mockReturnValue("test-internal-secret");
  });

  it("rejects missing internal job credentials before running the reminder stub", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/jobs/send-reminders", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthorized"
    });
    expect(loggingMocks.logStructuredEvent).toHaveBeenCalledWith(
      "warn",
      "internal_job_unauthorized",
      expect.objectContaining({
        path: "/api/internal/jobs/send-reminders"
      })
    );
  });

  it("rejects invalid internal job credentials", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/jobs/send-reminders", {
        headers: {
          "x-internal-job-secret": "wrong-secret"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthorized"
    });
  });

  it("returns the safe no-op reminder stub result for valid internal job credentials", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/jobs/send-reminders", {
        headers: {
          "x-internal-job-secret": "test-internal-secret"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobName: "notifications.sendReminders",
      status: "stub",
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      metrics: {},
      notes: [
        "Reminder delivery is intentionally deferred until reminder-send dedupe is persisted.",
        "This job currently performs no reminder sends and is safe to leave unscheduled until reservation reminder state can be tracked."
      ]
    });
    expect(loggingMocks.logStructuredEvent).toHaveBeenCalledWith(
      "info",
      "internal_job_completed",
      expect.objectContaining({
        jobName: "notifications.sendReminders",
        status: "stub",
        processedCount: 0
      })
    );
  });
});
