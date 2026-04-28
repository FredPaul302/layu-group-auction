import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const authMocks = vi.hoisted(() => ({
  requireInternalJobAuthorization: vi.fn()
}));

const auctionJobMocks = vi.hoisted(() => ({
  closeExpiredAuctions: vi.fn()
}));

const orderJobMocks = vi.hoisted(() => ({
  expireOverdueOrders: vi.fn()
}));

vi.mock("@/app/api/_utils/internal-jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/_utils/internal-jobs")>();

  return {
    ...actual,
    requireInternalJobAuthorization: authMocks.requireInternalJobAuthorization,
    runInternalJobRoute: async (
      request: NextRequest,
      input: {
        jobName: string;
        run: () => Promise<unknown>;
      }
    ) => {
      const unauthorizedResponse = authMocks.requireInternalJobAuthorization(request);

      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      try {
        const result = await input.run();

        return NextResponse.json(result);
      } catch {
        return NextResponse.json(
          {
            jobName: input.jobName,
            status: "error"
          },
          {
            status: 500
          }
        );
      }
    }
  };
});
vi.mock("@/lib/auctions", () => auctionJobMocks);
vi.mock("@/lib/orders", () => orderJobMocks);

import { POST as postCloseAuctions } from "../src/app/api/internal/jobs/close-auctions/route.js";
import { POST as postExpireOverdueOrders } from "../src/app/api/internal/jobs/expire-overdue-payments/route.js";

describe("internal job routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireInternalJobAuthorization.mockReturnValue(null);
  });

  it("returns the overdue-order job result from the protected scheduler entrypoint", async () => {
    orderJobMocks.expireOverdueOrders.mockResolvedValue({
      jobName: "orders.expireOverdue",
      status: "completed",
      dryRun: false,
      processedCount: 1,
      skippedCount: 0,
      errorCount: 0,
      startedAtUtc: "2026-04-24T12:00:00.000Z",
      completedAtUtc: "2026-04-24T12:00:01.000Z",
      timestampUtc: "2026-04-24T12:00:01.000Z",
      metrics: {
        paymentOverdueCount: 1,
        releasedReservationCount: 1
      },
      notes: ["Released 1 fixed-price reservation."]
    });

    const response = await postExpireOverdueOrders(
      new NextRequest("http://localhost/api/internal/jobs/expire-overdue-payments", {
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobName: "orders.expireOverdue",
      processedCount: 1,
      metrics: {
        releasedReservationCount: 1
      }
    });
  });

  it("returns the auction-close job result from the protected scheduler entrypoint", async () => {
    auctionJobMocks.closeExpiredAuctions.mockResolvedValue({
      jobName: "auctions.closeExpired",
      status: "completed",
      dryRun: false,
      processedCount: 2,
      skippedCount: 0,
      errorCount: 0,
      startedAtUtc: "2026-04-24T12:00:00.000Z",
      completedAtUtc: "2026-04-24T12:00:03.000Z",
      timestampUtc: "2026-04-24T12:00:03.000Z",
      metrics: {
        finalizedWithWinnerCount: 1,
        endedNoBidsCount: 1
      },
      notes: ["Resolved 2 expired auctions."]
    });

    const response = await postCloseAuctions(
      new NextRequest("http://localhost/api/internal/jobs/close-auctions", {
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobName: "auctions.closeExpired",
      processedCount: 2,
      metrics: {
        finalizedWithWinnerCount: 1,
        endedNoBidsCount: 1
      }
    });
  });

  it("returns the authorization response when the scheduler secret is invalid", async () => {
    authMocks.requireInternalJobAuthorization.mockReturnValue(
      NextResponse.json(
        {
          status: "unauthorized"
        },
        {
          status: 401
        }
      )
    );

    const response = await postExpireOverdueOrders(
      new NextRequest("http://localhost/api/internal/jobs/expire-overdue-payments", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "unauthorized"
    });
    expect(orderJobMocks.expireOverdueOrders).not.toHaveBeenCalled();
  });

  it("returns a safe 500 payload when a protected job throws", async () => {
    auctionJobMocks.closeExpiredAuctions.mockRejectedValue(new Error("database temporarily unavailable"));

    const response = await postCloseAuctions(
      new NextRequest("http://localhost/api/internal/jobs/close-auctions", {
        method: "POST"
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      jobName: "auctions.closeExpired",
      status: "error"
    });
  });
});
