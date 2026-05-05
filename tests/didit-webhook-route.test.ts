import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verificationServiceMocks = vi.hoisted(() => ({
  processDiditWebhookPayload: vi.fn(),
  verifyDiditWebhookSignature: vi.fn()
}));

vi.mock("@/lib/verification/service", () => verificationServiceMocks);

import { POST } from "../src/app/api/didit/webhook/route.js";
import { resetRateLimitStoreForTests } from "../src/lib/rate-limit/index.js";

function buildRequest(body: unknown, headers?: HeadersInit) {
  return new NextRequest("http://localhost/api/didit/webhook", {
    body: JSON.stringify(body),
    headers: {
      "x-forwarded-for": "203.0.113.50",
      ...headers
    },
    method: "POST"
  });
}

describe("Didit webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
    verificationServiceMocks.processDiditWebhookPayload.mockResolvedValue({
      status: "processed"
    });
    verificationServiceMocks.verifyDiditWebhookSignature.mockReturnValue(true);
  });

  it("rejects missing or invalid signatures before processing", async () => {
    verificationServiceMocks.verifyDiditWebhookSignature.mockReturnValue(false);

    const response = await POST(
      buildRequest({
        session_id: "didit_session_1",
        status: "Approved"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "invalid_signature"
    });
    expect(verificationServiceMocks.processDiditWebhookPayload).not.toHaveBeenCalled();
  });

  it("processes signed webhook payloads", async () => {
    const payload = {
      session_id: "didit_session_1",
      status: "Approved"
    };

    const response = await POST(
      buildRequest(payload, {
        "X-Signature-V2": "valid",
        "X-Timestamp": "1774970000"
      })
    );

    expect(response.status).toBe(200);
    expect(verificationServiceMocks.verifyDiditWebhookSignature).toHaveBeenCalledWith({
      payload,
      signatureSimple: null,
      signatureV2: "valid",
      timestamp: "1774970000"
    });
    expect(verificationServiceMocks.processDiditWebhookPayload).toHaveBeenCalledWith(payload);
  });
});
