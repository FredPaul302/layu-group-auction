import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verificationServiceMocks = vi.hoisted(() => ({
  syncDiditHostedReturn: vi.fn()
}));

vi.mock("@/lib/verification/service", () => verificationServiceMocks);

import { GET } from "../src/app/api/verifications/didit/callback/route.js";

describe("Didit hosted callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not trust a public approved query status", async () => {
    verificationServiceMocks.syncDiditHostedReturn.mockResolvedValue("pending");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/verifications/didit/callback?verificationSessionId=didit_session_1&status=Approved"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/verification/identity?status=returned"
    );
    expect(verificationServiceMocks.syncDiditHostedReturn).toHaveBeenCalledWith({
      verificationSessionId: "didit_session_1"
    });
  });

  it("does not write verification state without a session id", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/verifications/didit/callback?status=Approved"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/account/verification/identity?status=returned"
    );
    expect(verificationServiceMocks.syncDiditHostedReturn).not.toHaveBeenCalled();
  });
});
