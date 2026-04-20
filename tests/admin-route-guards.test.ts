import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentUserFromCookieSource: vi.fn()
}));

const verificationServiceMocks = vi.hoisted(() => ({
  reviewDepositSubmission: vi.fn()
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/verification/service", () => verificationServiceMocks);

import { POST } from "../src/app/api/verifications/deposit/[verificationId]/review/route.js";

describe("admin API route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects non-admin users away from deposit review actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "user_1",
      role: "bidder",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const formData = new FormData();
    formData.set("decision", "approve");
    formData.set("reviewNotes", "Looks fine");

    const response = await POST(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/review", {
        method: "POST",
        body: formData
      }),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login");
    expect(verificationServiceMocks.reviewDepositSubmission).not.toHaveBeenCalled();
  });

  it("allows admin users through to deposit review actions", async () => {
    authMocks.getCurrentUserFromCookieSource.mockResolvedValue({
      id: "admin_1",
      role: "admin",
      emailVerifiedAtUtc: "2026-04-20T00:00:00.000Z"
    });

    const formData = new FormData();
    formData.set("decision", "approve");
    formData.set("reviewNotes", "Looks fine");

    const response = await POST(
      new NextRequest("http://localhost/api/verifications/deposit/dep_1/review", {
        method: "POST",
        body: formData
      }),
      {
        params: Promise.resolve({
          verificationId: "dep_1"
        })
      }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin/deposits");
    expect(verificationServiceMocks.reviewDepositSubmission).toHaveBeenCalledWith({
      depositId: "dep_1",
      reviewedByUserId: "admin_1",
      decision: "approve",
      reviewNotes: "Looks fine"
    });
  });
});
