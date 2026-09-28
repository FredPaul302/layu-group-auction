import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createListingDescriptionDraft,
  descriptionDraftMaxOutputTokens,
  descriptionDraftModel,
  geminiDescriptionDraftModel,
  isListingDescriptionDraftEnabled
} from "../src/lib/ai/listing-description.js";
import { validateDescriptionDraftInput } from "../src/lib/catalog/description-draft-input.js";
import { descriptionPhotoFixture } from "./fixtures/description-photo.js";

const facts = {
  title: "Walnut side table",
  category: "Furniture",
  conditionNote: "Scratched top. One handle missing.",
  description: "Two drawers. Measurements not recorded."
};

const expectedDraftSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: expect.any(String) },
    description: { type: "string", description: expect.any(String) },
    conditionNote: { type: "string", description: expect.any(String) }
  },
  required: ["title", "description", "conditionNote"],
  additionalProperties: false
};

function providerResponse(description = "Walnut side table with two drawers. The top is scratched and one handle is missing. Measurements have not been recorded.", title = "Walnut side table") {
  return {
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify({ title, description, conditionNote: facts.conditionNote }) }]
    }]
  };
}

describe("AI listing description drafting", () => {
  beforeEach(() => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-secret-only");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("makes one capped text-only request with facts and returns a preview without writing a listing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    const result = await createListingDescriptionDraft(facts, fetchMock);

    expect(result.description).toContain("one handle is missing");
    expect(result.title).toBe("Walnut side table");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options?.body as string);
    expect(body).toEqual({
      model: descriptionDraftModel,
      instructions: expect.stringContaining("Do not invent specific condition"),
      input: JSON.stringify(facts),
      text: { format: { type: "json_schema", name: "listing_draft", strict: true, schema: expectedDraftSchema } },
      max_output_tokens: descriptionDraftMaxOutputTokens,
      store: false
    });
    expect(body.instructions).toContain("Preserve every stated defect");
    expect(body.instructions).toContain("untrusted source data");
    expect(body.instructions).toContain("both title and description");
    expect(body.instructions).toContain("never add an unsupported brand or model");
    expect(body.instructions).toContain("tested and working at the time of sale unless the seller states otherwise");
    expect(body.instructions).toContain("Do not add generic statements that functionality cannot be tested just because an item is furniture");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("interprets seller editing instructions separately from item facts and preserves grounding rules", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    const result = await createListingDescriptionDraft({ ...facts, revisionInstructions: "  Shorten the description, keeping both defects.  ", includePriceSuggestion: true, listingType: "auction" }, fetchMock);
    expect(result.conditionNote).toBe(facts.conditionNote);
    expect(result).not.toHaveProperty("priceSuggestion");
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input).revisionInstructions).toBe("Shorten the description, keeping both defects.");
    expect(body.instructions).toContain("revisionInstructions are trusted seller guidance");
    expect(body.instructions).toContain("do not conceal them on request");
    expect(body.instructions).toContain("labeling visual inferences as estimates");
    expect(body.text.format.schema.required).toContain("conditionNote");
  });

  it.each([undefined, 123, "", "C".repeat(2001)])("rejects a missing or invalid condition suggestion: %s", async (conditionNote) => {
    const payload = providerResponse();
    payload.output[0].content[0].text = JSON.stringify({ title: facts.title, description: facts.description, conditionNote });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 502 });
  });

  it("validates editing instructions before contacting the provider", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (const changes of [{ revisionInstructions: 42 }, { revisionInstructions: "x".repeat(2001) }, { revisionInstructions: "Make it shorter", description: " " }, { saleContext: "x".repeat(2001) }]) {
      expect(validateDescriptionDraftInput({ ...facts, ...changes }).input).toBeNull();
    }
    await expect(createListingDescriptionDraft({ ...facts, revisionInstructions: "x".repeat(2001) }, fetchMock)).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses photo-only input without requiring a title, and sends images as image parts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    await createListingDescriptionDraft({ title: "", category: "", conditionNote: "", description: "", images: [descriptionPhotoFixture] }, fetchMock);
    const options = fetchMock.mock.calls[0][1];
    const body = JSON.parse(options?.body as string);
    expect(body.input).toEqual([{
      role: "user",
      content: [
        { type: "input_text", text: JSON.stringify({ title: "", category: "", conditionNote: "", description: "" }) },
        { type: "input_image", image_url: descriptionPhotoFixture, detail: "high" }
      ]
    }]);
    expect(body.instructions).toContain("direct observations");
    expect(body.instructions).toContain("cannot prove function");
    expect(body.instructions).toContain("clearly legible");
    expect(body.instructions).toContain("background props");
    expect(body.instructions).toContain("photos appear mixed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("combines photos with seller defects and does not encode images as text facts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    await createListingDescriptionDraft({ ...facts, images: [descriptionPhotoFixture, descriptionPhotoFixture] }, fetchMock);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.input[0].content[0]).toEqual({ type: "input_text", text: JSON.stringify(facts) });
    expect(body.input[0].content).toHaveLength(3);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(descriptionDraftMaxOutputTokens);
  });

  it("adds sale-wide seller context as trusted guidance without mixing it into item facts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    const saleContext = "Furniture is sturdy; don't add a generic functionality warning.";
    await createListingDescriptionDraft({ ...facts, saleContext }, fetchMock);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.instructions).toContain(`Trusted sale-wide seller context: ${saleContext}`);
    expect(JSON.parse(body.input)).toEqual(facts);
    expect(body.instructions).toContain("Item-specific seller statements override general sale context");
  });

  it.each([
    ["https://example.com/photo.jpg"],
    ["data:image/jpeg;base64,bm90IGEgSlBFRw=="],
    Array(4).fill(descriptionPhotoFixture)
  ])("rejects invalid photos before provider use", async (...images) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createListingDescriptionDraft({ ...facts, images }, fetchMock)).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards cancellation and skips an already cancelled request without retries", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(providerResponse()));
    await createListingDescriptionDraft(facts, fetchMock, controller.signal);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    fetchMock.mockClear();
    await expect(createListingDescriptionDraft(facts, fetchMock, controller.signal)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { key: "", enabled: "true" },
    { key: "test-secret-only", enabled: "false" },
    { key: "test-secret-only", enabled: "" }
  ])("does not call the provider without both explicit enablement and a key: %o", async ({ key, enabled }) => {
    vi.stubEnv("OPENAI_API_KEY", key);
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", enabled);
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      status: 503,
      code: "description_ai_disabled"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects overlong or missing facts before spending on an API request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (const input of [
      { ...facts, title: "x".repeat(201) },
      { ...facts, conditionNote: "x".repeat(2001) },
      { ...facts, description: "x".repeat(4001) },
      { ...facts, conditionNote: "", description: " " }
    ]) {
      await expect(createListingDescriptionDraft(input, fetchMock)).rejects.toMatchObject({ status: 422 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...providerResponse(), status: "incomplete" },
    { status: "completed", output: [] },
    { status: "completed", output: [null] },
    { status: "completed", output: [{ ...providerResponse().output[0], status: "incomplete" }] },
    { status: "completed", output: [{ ...providerResponse().output[0], role: "user" }] },
    { status: "completed", output: [providerResponse().output[0], providerResponse().output[0]] },
    { status: "completed", output: [{ ...providerResponse().output[0], content: [...providerResponse().output[0].content, { type: "tool_call" }] }] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }] },
    providerResponse("x".repeat(3001)),
    providerResponse("  "),
    { output_text: "Not a Responses API output array" }
  ])("rejects incomplete, refused, missing, or oversized provider output", async (payload) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      code: "description_provider_unavailable",
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error without retries or provider secrets on HTTP failure", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("test-secret-only provider details", { status: 429 }));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      message: "AI drafting could not finish. Your title and description have not changed. Try again later or continue writing them yourself.",
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => Promise.reject(new DOMException("Request timed out", "TimeoutError")),
    () => Promise.resolve(new Response("not json")),
    () => Promise.resolve(new Response("x".repeat(33 * 1024)))
  ])("handles timeout, invalid JSON, and overlarge response bodies without retries", async (implementation) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(implementation);
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects nonstring fields while forwarding only known listing facts", () => {
    expect(validateDescriptionDraftInput({ ...facts, conditionNote: 42 }).input).toBeNull();
    expect(validateDescriptionDraftInput({ ...facts, unrelated: "must not be sent" }).input).toEqual(facts);
    expect(validateDescriptionDraftInput({ ...facts, images: "bad" }).input).toBeNull();
    expect(validateDescriptionDraftInput({ ...facts, images: [null] }).input).toBeNull();
    expect(validateDescriptionDraftInput({ ...facts, title: "", conditionNote: "", description: "", images: [] }).input).toBeNull();
  });
});

function geminiResponse(description = "A side table with a scratched top and a missing handle.", title = "Side table") {
  return {
    candidates: [{
      finishReason: "STOP",
      content: { role: "model", parts: [{ text: JSON.stringify({ title, description, conditionNote: facts.conditionNote }) }] }
    }]
  };
}

describe("Gemini listing description drafting", () => {
  beforeEach(() => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "gemini");
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret-only");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-secret-only");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("makes one capped Gemini request for text facts with a header key and minimal thinking", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(geminiResponse()));
    const result = await createListingDescriptionDraft(facts, fetchMock);
    expect(result).toEqual({ title: "Side table", description: "A side table with a scratched top and a missing handle.", conditionNote: facts.conditionNote });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${geminiDescriptionDraftModel}:generateContent`);
    expect(String(url)).not.toContain("secret");
    expect(options?.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "test-gemini-secret-only" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.cache).toBe("no-store");
    expect(options?.redirect).toBe("error");
    const body = JSON.parse(options?.body as string);
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: expect.stringContaining("Preserve every stated defect") }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(facts) }] }],
      generationConfig: {
        maxOutputTokens: descriptionDraftMaxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: expectedDraftSchema,
        thinkingConfig: { thinkingLevel: "minimal" }
      }
    });
    expect(body.systemInstruction.parts[0].text).toContain("untrusted source data");
    expect(body.systemInstruction.parts[0].text).toContain("cannot prove function");
    expect(body.systemInstruction.parts[0].text).toContain("background props");
    expect(body.systemInstruction.parts[0].text).toContain("both title and description");
    expect(body.systemInstruction.parts[0].text).toContain("never add an unsupported brand or model");
    expect(options?.body).not.toContain("secret-only");
  });

  it("sends photo-only requests as JPEG inlineData without extra uploads or remote image fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(geminiResponse()));
    const emptyFacts = { title: "", category: "", conditionNote: "", description: "" };
    await createListingDescriptionDraft({ ...emptyFacts, images: Array(3).fill(descriptionPhotoFixture) }, fetchMock);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.contents).toEqual([{
      role: "user",
      parts: [
        { text: JSON.stringify(emptyFacts) },
        ...Array(3).fill({ inlineData: { mimeType: "image/jpeg", data: descriptionPhotoFixture.split(",")[1] } })
      ]
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses only Gemini credentials when selected and only OpenAI credentials when explicitly switched", async () => {
    expect(isListingDescriptionDraftEnabled()).toBe(true);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isListingDescriptionDraftEnabled()).toBe(false);
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", "openai");
    fetchMock.mockResolvedValue(Response.json(providerResponse()));
    await createListingDescriptionDraft(facts, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("x-goog-api-key");
  });

  it.each([
    { provider: "invalid", enabled: "true", key: "test-gemini-secret-only" },
    { provider: "gemini", enabled: "false", key: "test-gemini-secret-only" },
    { provider: "gemini", enabled: "true", key: "  " }
  ])("makes no provider call when configuration is disabled or invalid: %o", async ({ provider, enabled, key }) => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", provider);
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", enabled);
    vi.stubEnv("GEMINI_API_KEY", key);
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits thought text and joins only the final model description", async () => {
    const payload = geminiResponse();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...payload,
      candidates: [{ ...payload.candidates[0], content: { role: "model", parts: [
        { text: "Private reasoning is not a product description.", thought: true },
        { text: '{"title":"Side table","description":"A side table ', thought: false },
        { text: 'with a scratched top.","conditionNote":"Scratched top. One handle missing."}' }
      ] } }]
    }));
    expect(await createListingDescriptionDraft(facts, fetchMock)).toEqual({ title: "Side table", description: "A side table with a scratched top.", conditionNote: facts.conditionNote });
  });

  it.each([
    { candidates: [] },
    { candidates: [null] },
    { candidates: [geminiResponse().candidates[0], geminiResponse().candidates[0]] },
    { ...geminiResponse(), promptFeedback: { blockReason: "SAFETY" } },
    { ...geminiResponse(), promptFeedback: { safetyRatings: [{ blocked: true }] } },
    { ...geminiResponse(), promptFeedback: "invalid" },
    { candidates: [{ ...geminiResponse().candidates[0], safetyRatings: [{ blocked: true }] }] },
    { candidates: [{ ...geminiResponse().candidates[0], finishReason: "MAX_TOKENS" }] },
    { candidates: [{ ...geminiResponse().candidates[0], finishReason: "SAFETY" }] },
    { candidates: [{ ...geminiResponse().candidates[0], finishReason: undefined }] },
    { candidates: [{ finishReason: "STOP", content: { role: "user", parts: [{ text: "Wrong role" }] } }] },
    { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Thought only", thought: true }] } }] },
    { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Malformed thought", thought: "true" }] } }] },
    { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name: "not_requested" } }] } }] },
    { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [null] } }] },
    geminiResponse("  "),
    geminiResponse("x".repeat(3001)),
    providerResponse()
  ])("rejects blocked, incomplete, malformed, or non-description Gemini output without falling back", async (payload) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 502, code: "description_provider_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
  });

  it("returns a safe quota error so a bulk queue can stop, without retries or another provider", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("test-gemini-secret-only quota details", { status: 429 }));
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      status: 429,
      code: "description_provider_rate_limited",
      message: "The AI provider's request limit has been reached. Wait for the limit to reset or continue writing descriptions yourself."
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => Promise.resolve(new Response("test-gemini-secret-only provider details", { status: 401 })),
    () => Promise.resolve(new Response("test-gemini-secret-only provider details", { status: 500 })),
    () => Promise.reject(new Error("test-gemini-secret-only network details")),
    () => Promise.reject(new DOMException("test-gemini-secret-only", "TimeoutError")),
    () => Promise.resolve(new Response("not json")),
    () => Promise.resolve(new Response("x".repeat(33 * 1024)))
  ])("keeps Gemini failures secret-safe with bounded response bodies and no retries", async (implementation) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(implementation);
    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      status: 502,
      message: "AI drafting could not finish. Your title and description have not changed. Try again later or continue writing them yourself."
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed photos before calling Gemini", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createListingDescriptionDraft({ ...facts, images: ["data:image/jpeg;base64,bm90IGEgSlBFRw=="] }, fetchMock)).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards cancellation to Gemini and skips requests cancelled before starting", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(geminiResponse()));
    await createListingDescriptionDraft(facts, fetchMock, controller.signal);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    fetchMock.mockClear();
    await expect(createListingDescriptionDraft(facts, fetchMock, controller.signal)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe.each(["openai", "gemini"])("%s title and description validation", (provider) => {
  beforeEach(() => {
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_PROVIDER", provider);
    vi.stubEnv("AI_LISTING_DESCRIPTIONS_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-secret-only");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret-only");
  });

  afterEach(() => vi.unstubAllEnvs());

  function responseWithText(text: string) {
    if (provider === "gemini") {
      const response = geminiResponse();
      response.candidates[0].content.parts[0].text = text;
      return response;
    }
    const response = providerResponse();
    response.output[0].content[0].text = text;
    return response;
  }

  it("returns both trimmed suggestions together while preserving the input facts", async () => {
    const input = { ...facts, images: [descriptionPhotoFixture] };
    const original = structuredClone(input);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(responseWithText(JSON.stringify({
      title: "  Walnut side table with two drawers  ",
      description: "  Scratched top. One handle missing. Measurements not recorded.\nTwo drawers.  ",
      conditionNote: "  Scratched top. One handle missing.  "
    }))));

    expect(await createListingDescriptionDraft(input, fetchMock)).toEqual({
      title: "Walnut side table with two drawers",
      description: "Scratched top. One handle missing. Measurements not recorded.\nTwo drawers.",
      conditionNote: facts.conditionNote
    });
    expect(input).toEqual(original);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts the maximum title and description lengths without truncating", async () => {
    const draft = { title: "T".repeat(200), description: "D".repeat(3000), conditionNote: "C".repeat(2000) };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(responseWithText(JSON.stringify(draft))));

    expect(await createListingDescriptionDraft(facts, fetchMock)).toEqual(draft);
  });

  it.each([
    { name: "missing title", value: { description: "A scratched side table." } },
    { name: "missing description", value: { title: "Side table" } },
    { name: "empty title", value: { title: "  ", description: "A scratched side table." } },
    { name: "short title", value: { title: "AB", description: "A scratched side table." } },
    { name: "overlong title", value: { title: "T".repeat(201), description: "A scratched side table." } },
    { name: "multiline title", value: { title: "Side\ntable", description: "A scratched side table." } },
    { name: "Unicode line separator", value: { title: "Side\u2028table", description: "A scratched side table." } },
    { name: "control character in title", value: { title: "Side\u0000table", description: "A scratched side table." } },
    { name: "nonstring title", value: { title: 123, description: "A scratched side table." } },
    { name: "nonstring description", value: { title: "Side table", description: ["A scratched top."] } },
    { name: "empty description", value: { title: "Side table", description: " " } },
    { name: "overlong description", value: { title: "Side table", description: "D".repeat(3001) } },
    { name: "extra field", value: { title: "Side table", description: "A scratched side table.", price: 100 } },
    { name: "array response", value: [{ title: "Side table", description: "A scratched side table." }] },
    { name: "null response", value: null }
  ])("rejects $name instead of returning or repairing a partial draft", async ({ value }) => {
    const complete = value && typeof value === "object" && !Array.isArray(value) ? { conditionNote: facts.conditionNote, ...value } : value;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(responseWithText(JSON.stringify(complete))));

    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({
      status: 502,
      code: "description_provider_unavailable"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "A side table with a scratched top.",
    '{"title":"Side table","description":"Unfinished',
    '```json\n{"title":"Side table","description":"A scratched top."}\n```'
  ])("rejects unstructured or incomplete draft JSON without a fallback", async (text) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(responseWithText(text)));

    await expect(createListingDescriptionDraft(facts, fetchMock)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
