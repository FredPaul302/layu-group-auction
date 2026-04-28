import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verificationServiceMocks = vi.hoisted(() => ({
  syncPersonaHostedReturn: vi.fn()
}));

vi.mock("@/lib/verification/service", () => verificationServiceMocks);

import { GET } from "../src/app/api/verifications/persona/callback/route.js";

describe("Persona hosted callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not trust a public approved query status", async () => {
    verificationServiceMocks.syncPersonaHostedReturn.mockResolvedValue("pending");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/verifications/persona/callback?inquiry-id=inq_1&reference-id=layu-user%3Auser_1&status=approved"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/verification/persona?status=returned"
    );
    expect(verificationServiceMocks.syncPersonaHostedReturn).toHaveBeenCalledWith({
      inquiryId: "inq_1",
      referenceId: "layu-user:user_1"
    });
  });

  it("does not write verification state without an inquiry id", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/verifications/persona/callback?reference-id=layu-user%3Auser_1&status=approved"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/verification/persona?status=returned"
    );
    expect(verificationServiceMocks.syncPersonaHostedReturn).not.toHaveBeenCalled();
  });
});
