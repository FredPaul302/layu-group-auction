import { describe, expect, it, vi } from "vitest";

import { createDiditHostedSession } from "../src/lib/verification/didit-client.js";

describe("Didit session client", () => {
  it("creates hosted sessions with x-api-key, workflow_id, vendor_data, and callback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "didit_session_1",
          verification_url: "https://verify.didit.me/session/didit_session_1",
          workflow_id: "workflow_1",
          vendor_data: "layu-user:user_1",
          status: "Not Started"
        }),
        {
          status: 200
        }
      )
    );

    const result = await createDiditHostedSession(
      {
        apiKey: "didit_api_key",
        baseUrl: "https://verification.didit.me",
        callback: "https://auction.example.com/api/verifications/didit/callback",
        vendorData: "layu-user:user_1",
        workflowId: "workflow_1"
      },
      fetchMock
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://verification.didit.me/v3/session/",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "didit_api_key"
        },
        method: "POST"
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      workflow_id: "workflow_1",
      vendor_data: "layu-user:user_1",
      callback: "https://auction.example.com/api/verifications/didit/callback"
    });
    expect(result).toEqual({
      redirectUrl: "https://verify.didit.me/session/didit_session_1",
      sessionId: "didit_session_1",
      status: "Not Started",
      vendorData: "layu-user:user_1",
      workflowId: "workflow_1"
    });
  });
});
