import { describe, expect, it } from "vitest";

import { isInternalJobRequestAuthorized } from "../src/app/api/_utils/internal-jobs.js";

describe("internal job authorization", () => {
  it("accepts the explicit internal job header", () => {
    const request = new Request("http://localhost/api/internal/jobs/test", {
      headers: {
        "x-internal-job-secret": "secret-123"
      }
    });

    expect(isInternalJobRequestAuthorized(request, "secret-123")).toBe(true);
  });

  it("accepts bearer authorization for internal jobs", () => {
    const request = new Request("http://localhost/api/internal/jobs/test", {
      headers: {
        authorization: "Bearer secret-123"
      }
    });

    expect(isInternalJobRequestAuthorized(request, "secret-123")).toBe(true);
  });

  it("rejects invalid or missing credentials", () => {
    const request = new Request("http://localhost/api/internal/jobs/test");

    expect(isInternalJobRequestAuthorized(request, "secret-123")).toBe(false);
    expect(
      isInternalJobRequestAuthorized(
        new Request("http://localhost/api/internal/jobs/test", {
          headers: {
            "x-internal-job-secret": "wrong"
          }
        }),
        "secret-123"
      )
    ).toBe(false);
  });
});
