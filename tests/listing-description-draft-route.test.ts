import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({ getCurrentUserFromCookieSource: vi.fn() }));
const envMocks = vi.hoisted(() => ({ getAppEnv: vi.fn() }));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/config/app-env", () => envMocks);

import { POST } from "../src/app/api/admin/listings/description-draft/route.js";
import { descriptionDraftMaxRequestBytes } from "../src/lib/ai/listing-description.js";
import { descriptionPhotoMaxBytes } from "../src/lib/catalog/description-photos.js";
import { resetRateLimitStoreForTests } from "../src/lib/rate-limit/index.js";
import { descriptionPhotoFixture, descriptionPhotoWithBytes } from "./fixtures/description-photo.js";

const facts = {
  title: "Walnut side table",
  category: "Furniture",
  conditionNote: "Scratched top.",
  description: "Two drawers."
};

function buildRequest(options: { body?: string; origin?: string; contentType?: string; contentLength?: string } = {}) {
  const headers = new Headers({
    Origin: options.origin ?? "https://auction.example.com",
    "Content-Type": options.contentType ?? "application/json"
  });
  if (options.contentLength) {
    headers.set("Content-Length", options.contentLength);
  }
  return new NextRequest("https://auction.example.com/api/admin/listings/description-draft", {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify(facts)
  });
}

describe("admin listing description draft route", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
    vi.stubEnv("OPENAI_API_KEY", "test-secret-only");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "openai");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock);
    envMocks.getAppEnv.mockReturnValue({ app: { url: "https://auction.example.com" } });
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({ id: "admin-1", role: "admin" });
    fetchMock.mockImplementation(async () => Response.json({
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ title: "Walnut side table", description: "Walnut side table with two drawers and a scratched top.", conditionNote: facts.conditionNote }) }] }]
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects cross-origin submissions before authentication or provider use", async () => {
    const response = await POST(buildRequest({ origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(authMocks.getCurrentUserFromCookieSource).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, { id: "bidder-1", role: "bidder" }])("requires a signed-in administrator", async (user) => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue(user);
    const response = await POST(buildRequest());
    expect(response.status).toBe(303);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gracefully disables the endpoint without a configured key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(buildRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("description_ai_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { options: { contentType: "text/plain" }, status: 415 },
    { options: { contentLength: String(descriptionDraftMaxRequestBytes + 1) }, status: 413 },
    { options: { contentLength: "invalid" }, status: 413 },
    { options: { body: "x".repeat(descriptionDraftMaxRequestBytes + 1) }, status: 413 },
    { options: { body: "x".repeat(descriptionDraftMaxRequestBytes + 1), contentLength: "10" }, status: 413 },
    { options: { body: JSON.stringify({ ...facts, ignored: "x".repeat(33 * 1024) }) }, status: 413 },
    { options: { body: "broken json" }, status: 400 },
    { options: { body: JSON.stringify({ ...facts, description: "x".repeat(4001) }) }, status: 422 },
    { options: { body: JSON.stringify({ ...facts, title: 123 }) }, status: 422 },
    { options: { body: JSON.stringify({ ...facts, images: ["https://example.com/photo.jpg"] }) }, status: 422 },
    { options: { body: JSON.stringify({ ...facts, images: ["data:image/jpeg;base64,bm90IGEgSlBFRw=="] }) }, status: 422 },
    { options: { body: JSON.stringify({ ...facts, images: Array(4).fill(descriptionPhotoFixture) }) }, status: 422 },
    { options: { body: JSON.stringify({ ...facts, images: [descriptionPhotoWithBytes(descriptionPhotoMaxBytes + 1)] }) }, status: 422 }
  ])("rejects invalid or oversized requests without provider use: %o", async ({ options, status }) => {
    const response = await POST(buildRequest(options));
    expect(response.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an uncached preview without persisting or publishing", async () => {
    const response = await POST(buildRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "description_draft_ready",
      title: "Walnut side table",
      description: "Walnut side table with two drawers and a scratched top.",
      conditionNote: facts.conditionNote
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an optional price preview through the same protected endpoint", async () => {
    const priceSuggestion = { suggestedPriceCents: 2500, resaleLowCents: 2000, resaleHighCents: 4000, explanation: "Rough estimate for the scratched table." };
    fetchMock.mockResolvedValueOnce(Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ title: facts.title, description: facts.description, conditionNote: facts.conditionNote, priceSuggestion }) }] }] }));
    const response = await POST(buildRequest({ body: JSON.stringify({ ...facts, includePriceSuggestion: true, listingType: "fixed_price" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "description_draft_ready", priceSuggestion });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts explicit editing instructions through the protected endpoint without changing other listing fields", async () => {
    const response = await POST(buildRequest({ body: JSON.stringify({ ...facts, revisionInstructions: "Make this shorter; keep the scratch disclosure." }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "description_draft_ready", conditionNote: facts.conditionNote });
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).input)).toMatchObject({ revisionInstructions: "Make this shorter; keep the scratch disclosure." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a description-only provider response without exposing a partial suggestion", async () => {
    fetchMock.mockResolvedValue(Response.json({
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{
        type: "output_text", text: JSON.stringify({ description: "A scratched side table." })
      }] }]
    }));

    const response = await POST(buildRequest());
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("description_provider_unavailable");
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("description");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns Gemini quota exhaustion as 429 so batch drafting stops without exposing details", async () => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-secret-only");
    fetchMock.mockResolvedValue(new Response("gemini-test-secret-only quota details", { status: 429 }));
    const response = await POST(buildRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.status).toBe("description_provider_rate_limited");
    expect(JSON.stringify(body)).not.toContain("gemini-test-secret-only");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts three maximum-size photo copies with blank facts", async () => {
    const response = await POST(buildRequest({ body: JSON.stringify({
      title: "", category: "", conditionNote: "", description: "",
      images: Array(3).fill(descriptionPhotoWithBytes(descriptionPhotoMaxBytes))
    }) }));
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.input[0].content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(3);
  });

  it("returns a Gemini photo draft through the same admin preview endpoint", async () => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret-only");
    fetchMock.mockResolvedValue(Response.json({ candidates: [{
      finishReason: "STOP",
      content: { role: "model", parts: [{ text: JSON.stringify({ title: "Side table", description: "A side table with a scratched top.", conditionNote: facts.conditionNote }) }] }
    }] }));

    const response = await POST(buildRequest({ body: JSON.stringify({ ...facts, images: [descriptionPhotoFixture] }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "description_draft_ready",
      title: "Side table",
      description: "A side table with a scratched top.",
      conditionNote: facts.conditionNote
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  });

  it("leaves Gemini unavailable when only another provider has a key", async () => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "gemini");
    const response = await POST(buildRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("description_ai_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the incoming cancellation signal to the provider request", async () => {
    const controller = new AbortController();
    const request = new NextRequest(buildRequest(), { signal: controller.signal });
    expect((await POST(request)).status).toBe(200);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it("does not consume the request allowance for invalid photo input", async () => {
    for (let count = 0; count < 101; count += 1) {
      expect((await POST(buildRequest({ body: JSON.stringify({ ...facts, images: ["data:image/jpeg;base64,bm90IGEgSlBFRw=="] }) }))).status).toBe(422);
    }
    expect((await POST(buildRequest())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops the 101st request per administrator, sharing the allowance across text and photos", async () => {
    for (let count = 0; count < 100; count += 1) {
      const body = count % 2 === 0 ? facts : { ...facts, images: [descriptionPhotoFixture] };
      expect((await POST(buildRequest({ body: JSON.stringify(body) }))).status).toBe(200);
    }
    const response = await POST(buildRequest());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  it("caps total site requests across separate admin users", async () => {
    for (let count = 0; count < 100; count += 1) {
      authMocks.getCurrentUserFromCookieSource.mockResolvedValue({ id: `admin-${Math.floor(count / 20)}`, role: "admin" });
      expect((await POST(buildRequest())).status).toBe(200);
    }
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({ id: "another-admin", role: "admin" });
    expect((await POST(buildRequest())).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  it("reports provider failures safely and counts failed attempts toward the limit", async () => {
    fetchMock.mockRejectedValue(new Error("secret provider details"));
    for (let count = 0; count < 100; count += 1) {
      const response = await POST(buildRequest());
      expect(response.status).toBe(502);
      expect(JSON.stringify(await response.json())).not.toContain("secret provider details");
    }
    expect((await POST(buildRequest())).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });
});
