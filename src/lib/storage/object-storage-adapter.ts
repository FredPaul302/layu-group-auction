import { createHash, createHmac, randomUUID } from "node:crypto";

import { logStructuredEvent, serializeError } from "../ops/structured-logging";

import {
  getContentTypeForAssetKey,
  type ReadStoredAsset,
  type SaveAssetInput,
  type StorageAdapter,
  type StoredAsset
} from "./storage-adapter";

type ObjectStorageAdapterOptions = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string | null;
  region: string;
  secretAccessKey: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

function encodePathSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, "");
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function formatShortDate(date: Date) {
  return formatAmzDate(date).slice(0, 8);
}

function buildSigningKey(secretAccessKey: string, shortDate: string, region: string) {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, shortDate);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, "s3");

  return hmacSha256(serviceKey, "aws4_request");
}

export class ObjectStorageAdapter implements StorageAdapter {
  constructor(private readonly options: ObjectStorageAdapterOptions) {}

  async save(input: SaveAssetInput): Promise<StoredAsset> {
    const safeName = sanitizeFileName(input.fileName);
    const key = `${randomUUID()}-${safeName}`;
    const body =
      typeof input.body === "string" ? Buffer.from(input.body) : Buffer.from(input.body);

    try {
      await this.sendSignedRequest({
        body,
        contentType: input.contentType,
        key,
        method: "PUT"
      });
    } catch (error) {
      logStructuredEvent("error", "storage_save_failed", {
        driver: "object",
        key,
        bucket: this.options.bucket,
        endpoint: this.options.endpoint,
        error: serializeError(error)
      });
      throw error;
    }

    return {
      key,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: body.byteLength,
      publicUrl: this.getPublicUrl(key)
    };
  }

  async remove(key: string): Promise<void> {
    try {
      await this.sendSignedRequest({
        key,
        method: "DELETE"
      });
    } catch (error) {
      logStructuredEvent("error", "storage_remove_failed", {
        driver: "object",
        key,
        bucket: this.options.bucket,
        endpoint: this.options.endpoint,
        error: serializeError(error)
      });
      throw error;
    }
  }

  async read(key: string): Promise<ReadStoredAsset> {
    const response = await this.sendSignedRequest({
      key,
      method: "GET"
    });
    const body = Buffer.from(await response.arrayBuffer());

    return {
      key,
      contentType: response.headers.get("Content-Type") ?? getContentTypeForAssetKey(key),
      body,
      sizeBytes: body.byteLength
    };
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split("/").map(encodePathSegment).join("/");

    if (this.options.publicBaseUrl) {
      return `${trimTrailingSlash(this.options.publicBaseUrl)}/${encodedKey}`;
    }

    const { requestUrl } = this.buildRequestTarget(encodedKey);

    return requestUrl.toString();
  }

  private buildRequestTarget(encodedKey: string) {
    const endpointUrl = new URL(
      trimTrailingSlash(this.options.endpoint).concat("/")
    );
    const endpointPath = endpointUrl.pathname.replace(/\/+$/u, "");
    const objectPathSuffix = this.options.forcePathStyle === false
      ? `/${encodedKey}`
      : `/${encodePathSegment(this.options.bucket)}/${encodedKey}`;

    if (this.options.forcePathStyle === false) {
      endpointUrl.hostname = `${this.options.bucket}.${endpointUrl.hostname}`;
    }

    endpointUrl.pathname = `${endpointPath}${objectPathSuffix}`;

    return {
      canonicalPath: endpointUrl.pathname,
      requestUrl: endpointUrl
    };
  }

  private async sendSignedRequest(input: {
    body?: Buffer;
    contentType?: string;
    key: string;
    method: "GET" | "PUT" | "DELETE";
  }) {
    const body = input.body ?? Buffer.alloc(0);
    const encodedKey = input.key.split("/").map(encodePathSegment).join("/");
    const { canonicalPath, requestUrl } = this.buildRequestTarget(encodedKey);
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const shortDate = formatShortDate(now);
    const payloadHash = sha256Hex(body);
    const credentialScope = `${shortDate}/${this.options.region}/s3/aws4_request`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = [
      `host:${requestUrl.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n");
    const canonicalRequest = [
      input.method,
      canonicalPath,
      "",
      `${canonicalHeaders}\n`,
      signedHeaders,
      payloadHash
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");
    const signature = createHmac(
      "sha256",
      buildSigningKey(this.options.secretAccessKey, shortDate, this.options.region)
    )
      .update(stringToSign)
      .digest("hex");
    const authorization = [
      "AWS4-HMAC-SHA256",
      `Credential=${this.options.accessKeyId}/${credentialScope},`,
      `SignedHeaders=${signedHeaders},`,
      `Signature=${signature}`
    ].join(" ");
    const headers = new Headers({
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    });

    if (input.contentType) {
      headers.set("Content-Type", input.contentType);
    }

    const response = await fetch(requestUrl, {
      body: input.method === "PUT" ? new Uint8Array(body) : undefined,
      headers,
      method: input.method
    });

    if (!response.ok) {
      throw new Error(
        `Object storage ${input.method} failed with ${response.status} ${response.statusText}.`
      );
    }

    return response;
  }
}
