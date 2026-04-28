import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  isSameOriginRequest,
  requireSameOriginRequest
} from "../src/app/api/_utils/origin.js";

const appUrl = "https://auction.example.com/";

function buildRequest(method: string, headers?: HeadersInit) {
  return new NextRequest("https://auction.example.com/api/mutation", {
    headers,
    method
  });
}

describe("same-origin API mutation guard", () => {
  it("allows matching Origin headers", () => {
    const response = requireSameOriginRequest(
      buildRequest("POST", {
        Origin: "https://auction.example.com"
      }),
      appUrl
    );

    expect(response).toBeNull();
  });

  it("allows matching Referer headers when Origin is absent", () => {
    const response = requireSameOriginRequest(
      buildRequest("POST", {
        Referer: "https://auction.example.com/account"
      }),
      appUrl
    );

    expect(response).toBeNull();
  });

  it("rejects foreign Origin headers", () => {
    const response = requireSameOriginRequest(
      buildRequest("POST", {
        Origin: "https://evil.example"
      }),
      appUrl
    );

    expect(response?.status).toBe(403);
  });

  it("rejects foreign Referer headers when Origin is absent", () => {
    const response = requireSameOriginRequest(
      buildRequest("POST", {
        Referer: "https://evil.example/form"
      }),
      appUrl
    );

    expect(response?.status).toBe(403);
  });

  it("rejects mutation requests without Origin or Referer", () => {
    const response = requireSameOriginRequest(buildRequest("DELETE"), appUrl);

    expect(response?.status).toBe(403);
  });

  it("does not require validation for GET and HEAD requests", () => {
    expect(isSameOriginRequest(buildRequest("GET"), appUrl)).toBe(true);
    expect(isSameOriginRequest(buildRequest("HEAD"), appUrl)).toBe(true);
  });
});
