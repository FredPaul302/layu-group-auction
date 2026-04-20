type SessionCookieRole = "admin" | "bidder";

export type SessionCookieSnapshot = {
  sessionToken: string;
  userId: string;
  role: SessionCookieRole;
  emailVerified: boolean;
  expiresAtUnix: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeBase64Url(input: string) {
  const bytes = textEncoder.encode(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized.padEnd(normalized.length + padding, "="));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return textDecoder.decode(bytes);
}

async function signValue(value: string, secret: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value));
  let binary = "";

  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function createSessionCookieValue(
  snapshot: SessionCookieSnapshot,
  secret: string
) {
  const encodedPayload = encodeBase64Url(JSON.stringify(snapshot));
  const signature = await signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifySessionCookieValue(value: string, secret: string) {
  const [encodedPayload, providedSignature] = value.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload, secret);

  if (!constantTimeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  try {
    const snapshot = JSON.parse(decodeBase64Url(encodedPayload)) as SessionCookieSnapshot;

    if (snapshot.expiresAtUnix * 1000 <= Date.now()) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}
