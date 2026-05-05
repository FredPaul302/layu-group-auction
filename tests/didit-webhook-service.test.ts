import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    bidderProfile: {
      upsert: vi.fn()
    },
    deposit: {
      findMany: vi.fn()
    },
    personaVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => prismaMocks);

import { processDiditWebhookPayload } from "../src/lib/verification/service.js";

describe("Didit webhook processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.deposit.findMany.mockResolvedValue([]);
    prismaMocks.prisma.bidderProfile.upsert.mockResolvedValue({});
  });

  it("marks approved Didit webhooks as approved identity verification", async () => {
    prismaMocks.prisma.personaVerification.findUnique.mockResolvedValue(null);
    prismaMocks.prisma.personaVerification.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "approved"
      });
    prismaMocks.prisma.personaVerification.create.mockResolvedValue({
      id: "verification_1",
      status: "approved",
      userId: "user_1"
    });

    const result = await processDiditWebhookPayload({
      session_id: "didit_session_1",
      status: "Approved",
      timestamp: 1776816000,
      vendor_data: "layu-user:user_1",
      webhook_type: "status.updated",
      workflow_id: "workflow_1"
    });

    expect(result).toEqual({
      status: "processed",
      sessionId: "didit_session_1",
      localStatus: "approved",
      webhookType: "status.updated"
    });
    expect(prismaMocks.prisma.personaVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inquiryId: "didit_session_1",
        referenceId: "layu-user:user_1",
        status: "approved",
        verificationTemplateId: "workflow_1"
      })
    });
    expect(prismaMocks.prisma.bidderProfile.upsert).toHaveBeenCalled();
  });

  it("marks declined Didit webhooks as rejected without creating duplicates", async () => {
    const existing = {
      id: "verification_1",
      userId: "user_1",
      status: "pending",
      decidedAtUtc: null,
      updatedAtUtc: new Date("2026-04-20T00:00:00.000Z"),
      submittedAtUtc: new Date("2026-04-20T00:00:00.000Z"),
      inquiryId: "didit_session_1",
      referenceId: "layu-user:user_1",
      verificationTemplateId: "workflow_1"
    };
    prismaMocks.prisma.personaVerification.findUnique.mockResolvedValue(existing);
    prismaMocks.prisma.personaVerification.findFirst.mockResolvedValue({
      status: "rejected"
    });
    prismaMocks.prisma.personaVerification.update.mockResolvedValue({
      ...existing,
      status: "rejected"
    });

    const result = await processDiditWebhookPayload({
      session_id: "didit_session_1",
      status: "Declined",
      timestamp: 1776816000,
      vendor_data: "layu-user:user_1",
      webhook_type: "status.updated",
      workflow_id: "workflow_1"
    });

    expect(result).toEqual({
      status: "processed",
      sessionId: "didit_session_1",
      localStatus: "rejected",
      webhookType: "status.updated"
    });
    expect(prismaMocks.prisma.personaVerification.create).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.personaVerification.update).toHaveBeenCalledWith({
      where: {
        id: "verification_1"
      },
      data: expect.objectContaining({
        status: "rejected"
      })
    });
  });
});
