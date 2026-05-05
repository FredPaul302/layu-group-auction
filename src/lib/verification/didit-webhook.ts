import { createHmac, timingSafeEqual } from "node:crypto";

type DiditWebhookPayload = {
  session_id?: unknown;
  status?: unknown;
  timestamp?: unknown;
  webhook_type?: unknown;
};

type DiditWebhookHeaders = {
  signatureSimple: string | null;
  signatureV2: string | null;
  timestamp: string | null;
};

const webhookFreshnessWindowSeconds = 5 * 60;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeWholeFloats(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeWholeFloats);
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeWholeFloats(nestedValue)
      ])
    );
  }

  if (typeof value === "number" && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value);
  }

  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (isPlainRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeys(value[key]);
        return result;
      }, {});
  }

  return value;
}

function isFreshTimestamp(timestamp: string) {
  const parsedTimestamp = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);

  return Math.abs(currentTime - parsedTimestamp) <= webhookFreshnessWindowSeconds;
}

function safeCompareHex(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function hmacHex(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function verifySignatureV2(payload: unknown, signature: string, secret: string) {
  const canonicalJson = JSON.stringify(sortKeys(normalizeWholeFloats(payload)));
  const expectedSignature = hmacHex(canonicalJson, secret);

  return safeCompareHex(expectedSignature, signature.trim());
}

function getPayloadField(payload: DiditWebhookPayload, key: keyof DiditWebhookPayload) {
  const value = payload[key];

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function verifySignatureSimple(
  payload: DiditWebhookPayload,
  signature: string,
  secret: string
) {
  const canonicalString = [
    getPayloadField(payload, "timestamp"),
    getPayloadField(payload, "session_id"),
    getPayloadField(payload, "status"),
    getPayloadField(payload, "webhook_type")
  ].join(":");
  const expectedSignature = hmacHex(canonicalString, secret);

  return safeCompareHex(expectedSignature, signature.trim());
}

export function verifyDiditWebhookSignature(input: {
  headers: DiditWebhookHeaders;
  payload: unknown;
  secret: string;
}) {
  if (!input.headers.timestamp || !isFreshTimestamp(input.headers.timestamp)) {
    return false;
  }

  if (input.headers.signatureV2) {
    if (verifySignatureV2(input.payload, input.headers.signatureV2, input.secret)) {
      return true;
    }
  }

  if (input.headers.signatureSimple && isPlainRecord(input.payload)) {
    return verifySignatureSimple(
      input.payload,
      input.headers.signatureSimple,
      input.secret
    );
  }

  return false;
}

export function createDiditSignatureV2ForTests(payload: unknown, secret: string) {
  const canonicalJson = JSON.stringify(sortKeys(normalizeWholeFloats(payload)));

  return hmacHex(canonicalJson, secret);
}

export function createDiditSimpleSignatureForTests(
  payload: DiditWebhookPayload,
  secret: string
) {
  return hmacHex(
    [
      getPayloadField(payload, "timestamp"),
      getPayloadField(payload, "session_id"),
      getPayloadField(payload, "status"),
      getPayloadField(payload, "webhook_type")
    ].join(":"),
    secret
  );
}
