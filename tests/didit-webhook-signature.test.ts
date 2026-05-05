import { describe, expect, it } from "vitest";

import {
  createDiditSignatureV2ForTests,
  createDiditSimpleSignatureForTests,
  verifyDiditWebhookSignature
} from "../src/lib/verification/didit-webhook.js";

function timestamp() {
  return String(Math.floor(Date.now() / 1000));
}

describe("Didit webhook signature verification", () => {
  it("rejects missing signatures", () => {
    expect(
      verifyDiditWebhookSignature({
        headers: {
          signatureSimple: null,
          signatureV2: null,
          timestamp: timestamp()
        },
        payload: {
          session_id: "didit_session_1"
        },
        secret: "didit_webhook_secret"
      })
    ).toBe(false);
  });

  it("accepts a valid X-Signature-V2 signature", () => {
    const payload = {
      session_id: "didit_session_1",
      status: "Approved",
      timestamp: Number(timestamp()),
      vendor_data: "layu-user:user_1",
      webhook_type: "status.updated"
    };
    const secret = "didit_webhook_secret";

    expect(
      verifyDiditWebhookSignature({
        headers: {
          signatureSimple: null,
          signatureV2: createDiditSignatureV2ForTests(payload, secret),
          timestamp: timestamp()
        },
        payload,
        secret
      })
    ).toBe(true);
  });

  it("accepts a valid X-Signature-Simple fallback", () => {
    const payload = {
      session_id: "didit_session_1",
      status: "Declined",
      timestamp: Number(timestamp()),
      webhook_type: "status.updated"
    };
    const secret = "didit_webhook_secret";

    expect(
      verifyDiditWebhookSignature({
        headers: {
          signatureSimple: createDiditSimpleSignatureForTests(payload, secret),
          signatureV2: "invalid",
          timestamp: timestamp()
        },
        payload,
        secret
      })
    ).toBe(true);
  });
});
