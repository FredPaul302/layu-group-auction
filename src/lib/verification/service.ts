import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentMethodCode,
  Prisma,
  type PrismaClient,
  type SitePaymentMethod
} from "@prisma/client";

import { createOpaqueToken } from "@/lib/auth/tokens";
import { getAppEnv } from "@/lib/config/app-env";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter, getStoredAssetPublicUrl } from "@/lib/storage";

import {
  canApplyDepositReviewDecision,
  deriveActiveApprovedDepositAmountCents,
  deriveBidTierFromActiveHoldAmount,
  deriveVerificationEligibility,
  isSupportedDepositAmount,
  mapDepositReviewDecisionToStatus,
  type DepositReviewDecision
} from "./index";

type VerificationDbClient = Prisma.TransactionClient | PrismaClient;

const allowedDepositPaymentMethods = [
  PaymentMethodCode.paypal,
  PaymentMethodCode.venmo,
  PaymentMethodCode.cash_app
] as const;

function getPersonaTemplateId() {
  return process.env.PERSONA_TEMPLATE_ID?.trim() || null;
}

function getPersonaEnvironmentId() {
  return process.env.PERSONA_ENVIRONMENT_ID?.trim() || null;
}

function getPersonaSubdomain() {
  return process.env.PERSONA_SUBDOMAIN?.trim() || "inquiry";
}

function getPersonaWebhookSecret() {
  return process.env.PERSONA_WEBHOOK_SECRET?.trim() || null;
}

function buildPersonaReferenceId(userId: string) {
  return `layu-user:${userId}`;
}

function parseUserIdFromPersonaReferenceId(referenceId: string | null | undefined) {
  if (!referenceId?.startsWith("layu-user:")) {
    return null;
  }

  return referenceId.slice("layu-user:".length) || null;
}

function buildPersonaHostedFlowUrl(userId: string) {
  const templateId = getPersonaTemplateId();

  if (!templateId) {
    return null;
  }

  const url = new URL("/verify", `https://${getPersonaSubdomain()}.withpersona.com`);
  url.searchParams.set("inquiry-template-id", templateId);
  url.searchParams.set("reference-id", buildPersonaReferenceId(userId));
  url.searchParams.set(
    "redirect-uri",
    new URL("/api/verifications/persona/callback", getAppEnv().appUrl).toString()
  );

  const environmentId = getPersonaEnvironmentId();

  if (environmentId) {
    url.searchParams.set("environment-id", environmentId);
  }

  return url.toString();
}

function buildPublicProofUrl(proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return null;
  }

  return getStoredAssetPublicUrl(proofAssetKey);
}

async function syncBidderProfileVerificationStateWithClient(
  db: VerificationDbClient,
  userId: string
) {
  const [latestPersonaVerification, approvedDeposits] = await Promise.all([
    db.personaVerification.findFirst({
      where: {
        userId
      },
      orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }],
      select: {
        status: true
      }
    }),
    db.deposit.findMany({
      where: {
        userId,
        status: "approved"
      },
      select: {
        amountCents: true,
        status: true
      }
    })
  ]);

  const activeHoldAmountCents = deriveActiveApprovedDepositAmountCents(approvedDeposits);
  const maxBidTier =
    latestPersonaVerification?.status === "approved"
      ? "full"
      : deriveBidTierFromActiveHoldAmount(activeHoldAmountCents);

  return db.bidderProfile.upsert({
    where: {
      userId
    },
    update: {
      activeHoldAmountCents,
      maxBidTier
    },
    create: {
      userId,
      activeHoldAmountCents,
      maxBidTier,
      isBlocked: false,
      nonPaymentStrikeCount: 0
    }
  });
}

async function generateUniqueDepositReferenceCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `DEP-${createOpaqueToken(6)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 10)
      .toUpperCase()}`;
    const existing = await prisma.deposit.findUnique({
      where: {
        referenceCode: candidate
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique deposit reference code.");
}

async function findEnabledDepositPaymentMethod(code: PaymentMethodCode) {
  return prisma.sitePaymentMethod.findFirst({
    where: {
      code,
      isEnabled: true
    }
  });
}

function mapPersonaFlowStatusToLocalStatus(status: string | null | undefined) {
  switch (status) {
    case "approved":
      return "approved" as const;
    case "declined":
    case "failed":
      return "rejected" as const;
    case "expired":
      return "expired" as const;
    default:
      return "pending" as const;
  }
}

function mapPersonaEventNameToLocalStatus(eventName: string | null | undefined, inquiryStatus?: string) {
  switch (eventName) {
    case "inquiry.approved":
      return "approved" as const;
    case "inquiry.declined":
    case "inquiry.failed":
      return "rejected" as const;
    case "inquiry.expired":
      return "expired" as const;
    default:
      return mapPersonaFlowStatusToLocalStatus(inquiryStatus);
  }
}

async function upsertPersonaVerificationRecord(input: {
  inquiryId?: string | null;
  referenceId?: string | null;
  verificationTemplateId?: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  decisionSummary: string;
  occurredAtUtc: Date;
}) {
  const existing =
    (input.inquiryId
      ? await prisma.personaVerification.findUnique({
          where: {
            inquiryId: input.inquiryId
          }
        })
      : null) ??
    (input.referenceId
      ? await prisma.personaVerification.findFirst({
          where: {
            referenceId: input.referenceId
          },
          orderBy: [{ createdAtUtc: "desc" }]
        })
      : null);

  const userId = existing?.userId ?? parseUserIdFromPersonaReferenceId(input.referenceId);

  if (!userId) {
    return null;
  }

  if (existing) {
    const lastKnownAt =
      existing.decidedAtUtc ?? existing.updatedAtUtc ?? existing.submittedAtUtc;

    if (input.status === "pending" && existing.status !== "pending") {
      return existing;
    }

    if (lastKnownAt.getTime() > input.occurredAtUtc.getTime() && existing.status !== input.status) {
      return existing;
    }
  }

  const personaVerification = existing
    ? await prisma.personaVerification.update({
        where: {
          id: existing.id
        },
        data: {
          inquiryId: input.inquiryId ?? existing.inquiryId,
          referenceId: input.referenceId ?? existing.referenceId,
          verificationTemplateId: input.verificationTemplateId ?? existing.verificationTemplateId,
          status: input.status,
          decisionSummary: input.decisionSummary,
          decidedAtUtc:
            input.status === "pending"
              ? existing.decidedAtUtc
              : input.occurredAtUtc
        }
      })
    : await prisma.personaVerification.create({
        data: {
          userId,
          inquiryId: input.inquiryId ?? null,
          referenceId: input.referenceId ?? buildPersonaReferenceId(userId),
          verificationTemplateId: input.verificationTemplateId ?? getPersonaTemplateId(),
          status: input.status,
          decisionSummary: input.decisionSummary,
          submittedAtUtc: input.occurredAtUtc,
          decidedAtUtc: input.status === "pending" ? null : input.occurredAtUtc
        }
      });

  await syncBidderProfileVerificationStateWithClient(prisma, userId);

  return personaVerification;
}

export function isPersonaFlowConfigured() {
  return Boolean(getPersonaTemplateId());
}

export async function startPersonaVerificationFlow(userId: string) {
  const redirectUrl = buildPersonaHostedFlowUrl(userId);

  if (!redirectUrl) {
    return {
      status: "not_configured" as const
    };
  }

  const existingApproved = await prisma.personaVerification.findFirst({
    where: {
      userId,
      status: "approved"
    },
    orderBy: [{ decidedAtUtc: "desc" }, { createdAtUtc: "desc" }]
  });

  if (existingApproved) {
    return {
      status: "already_approved" as const
    };
  }

  await prisma.personaVerification.create({
    data: {
      userId,
      status: "pending",
      referenceId: buildPersonaReferenceId(userId),
      verificationTemplateId: getPersonaTemplateId(),
      decisionSummary: "Hosted Persona flow started.",
      submittedAtUtc: new Date()
    }
  });

  return {
    status: "redirect" as const,
    redirectUrl
  };
}

export async function syncPersonaHostedReturn(input: {
  inquiryId: string;
  referenceId: string | null;
  status: string | null;
}) {
  const localStatus = mapPersonaFlowStatusToLocalStatus(input.status);
  const occurredAtUtc = new Date();

  await upsertPersonaVerificationRecord({
    inquiryId: input.inquiryId,
    referenceId: input.referenceId,
    verificationTemplateId: getPersonaTemplateId(),
    status: localStatus,
    decisionSummary: `Hosted Persona flow returned with status=${input.status ?? "unknown"}.`,
    occurredAtUtc
  });

  return localStatus;
}

function parsePersonaSignatureHeader(headerValue: string) {
  const timestampMatch = headerValue.match(/t=([0-9]+)/u);
  const signatures = Array.from(headerValue.matchAll(/v1=([a-f0-9]+)/giu)).map(
    (match) => match[1]
  );

  return {
    timestamp: timestampMatch?.[1] ?? null,
    signatures
  };
}

export function verifyPersonaWebhookSignature(rawBody: string, headerValue: string | null) {
  const secret = getPersonaWebhookSecret();

  if (!secret || !headerValue) {
    return false;
  }

  const parsed = parsePersonaSignatureHeader(headerValue);

  if (!parsed.timestamp || parsed.signatures.length === 0) {
    return false;
  }

  const digest = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("hex");

  return parsed.signatures.some((signature) => {
    if (signature.length !== digest.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  });
}

export async function processPersonaWebhookPayload(payload: unknown) {
  const webhookEvent = payload as {
    data?: {
      attributes?: {
        name?: string;
        "created-at"?: string;
        payload?: {
          data?: {
            id?: string;
            attributes?: {
              status?: string;
              "reference-id"?: string;
            };
            relationships?: {
              "inquiry-template"?: {
                data?: {
                  id?: string;
                };
              };
            };
          };
        };
      };
    };
  };

  const eventName = webhookEvent.data?.attributes?.name ?? null;
  const inquiry = webhookEvent.data?.attributes?.payload?.data;
  const inquiryId = inquiry?.id ?? null;
  const referenceId = inquiry?.attributes?.["reference-id"] ?? null;

  if (!eventName || !inquiryId) {
    return {
      status: "ignored" as const
    };
  }

  const localStatus = mapPersonaEventNameToLocalStatus(
    eventName,
    inquiry?.attributes?.status
  );
  const occurredAtUtc = new Date(
    webhookEvent.data?.attributes?.["created-at"] ?? new Date().toISOString()
  );

  await upsertPersonaVerificationRecord({
    inquiryId,
    referenceId,
    verificationTemplateId: inquiry?.relationships?.["inquiry-template"]?.data?.id ?? null,
    status: localStatus,
    decisionSummary: `Persona webhook processed: ${eventName}.`,
    occurredAtUtc
  });

  return {
    status: "processed" as const,
    eventName,
    inquiryId,
    localStatus
  };
}

export async function createDepositDraft(input: {
  userId: string;
  amountCents: number;
  paymentMethodCode: PaymentMethodCode;
}) {
  if (!isSupportedDepositAmount(input.amountCents)) {
    throw new Error("Unsupported deposit tier amount.");
  }

  const sitePaymentMethod = await findEnabledDepositPaymentMethod(input.paymentMethodCode);

  if (!sitePaymentMethod) {
    throw new Error("Unsupported payment method.");
  }

  const referenceCode = await generateUniqueDepositReferenceCode();
  const existingDraft = await prisma.deposit.findFirst({
    where: {
      userId: input.userId,
      status: "draft"
    },
    orderBy: [{ createdAtUtc: "desc" }]
  });

  return existingDraft
    ? prisma.deposit.update({
        where: {
          id: existingDraft.id
        },
        data: {
          sitePaymentMethodId: sitePaymentMethod.id,
          amountCents: input.amountCents,
          referenceCode,
          payerHandle: null,
          externalReference: null,
          proofAssetKey: null,
          reviewNotes: null
        },
        include: {
          sitePaymentMethod: true
        }
      })
    : prisma.deposit.create({
        data: {
          userId: input.userId,
          sitePaymentMethodId: sitePaymentMethod.id,
          referenceCode,
          amountCents: input.amountCents,
          status: "draft"
        },
        include: {
          sitePaymentMethod: true
        }
      });
}

export async function submitDepositForReview(input: {
  depositId: string;
  userId: string;
  payerHandle: string;
  externalReference: string;
  screenshotFile: File | null;
}) {
  const existingDeposit = await prisma.deposit.findFirst({
    where: {
      id: input.depositId,
      userId: input.userId,
      status: "draft"
    }
  });

  if (!existingDeposit) {
    throw new Error("Deposit submission was not found.");
  }

  let proofAssetKey: string | null = null;

  if (input.screenshotFile && input.screenshotFile.size > 0) {
    if (!input.screenshotFile.type.startsWith("image/")) {
      throw new Error("Only image screenshots are supported.");
    }

    const storageAdapter = getStorageAdapter();
    const buffer = Buffer.from(await input.screenshotFile.arrayBuffer());
    const storedAsset = await storageAdapter.save({
      fileName: input.screenshotFile.name || "deposit-proof",
      contentType: input.screenshotFile.type,
      body: buffer
    });

    proofAssetKey = storedAsset.key;
  }

  return prisma.deposit.update({
    where: {
      id: existingDeposit.id
    },
    data: {
      payerHandle: input.payerHandle.trim(),
      externalReference: input.externalReference.trim(),
      proofAssetKey,
      status: "pending_review",
      submittedAtUtc: new Date()
    },
    include: {
      sitePaymentMethod: true
    }
  });
}

export async function reviewDepositSubmission(input: {
  depositId: string;
  reviewedByUserId: string;
  decision: DepositReviewDecision;
  reviewNotes: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const deposit = await transaction.deposit.findUnique({
      where: {
        id: input.depositId
      }
    });

    if (!deposit) {
      throw new Error("Deposit could not be found.");
    }

    if (!canApplyDepositReviewDecision(deposit.status, input.decision)) {
      throw new Error("That review decision is not valid for the current deposit status.");
    }

    const updatedDeposit = await transaction.deposit.update({
      where: {
        id: deposit.id
      },
      data: {
        status: mapDepositReviewDecisionToStatus(input.decision),
        reviewedByUserId: input.reviewedByUserId,
        reviewedAtUtc: new Date(),
        reviewNotes: input.reviewNotes.trim() || null
      }
    });

    await syncBidderProfileVerificationStateWithClient(transaction, updatedDeposit.userId);

    return updatedDeposit;
  });
}

export async function getUserVerificationOverview(userId: string) {
  const [user, personaHistory, deposits, paymentMethods] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: {
        id: userId
      },
      select: {
        id: true,
        emailVerifiedAtUtc: true,
        bidderProfile: {
          select: {
            isBlocked: true,
            maxBidTier: true,
            activeHoldAmountCents: true
          }
        }
      }
    }),
    prisma.personaVerification.findMany({
      where: {
        userId
      },
      orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }],
      take: 5
    }),
    prisma.deposit.findMany({
      where: {
        userId
      },
      orderBy: [{ createdAtUtc: "desc" }],
      take: 20,
      include: {
        sitePaymentMethod: true
      }
    }),
    prisma.sitePaymentMethod.findMany({
      where: {
        code: {
          in: [...allowedDepositPaymentMethods]
        },
        isEnabled: true
      },
      orderBy: [{ sortOrder: "asc" }]
    })
  ]);

  const latestPersonaVerification = personaHistory[0] ?? null;
  const activeApprovedDepositAmountCents = deriveActiveApprovedDepositAmountCents(deposits);
  const derivedEligibility = deriveVerificationEligibility({
    isBlocked: user.bidderProfile?.isBlocked ?? false,
    personaStatus: latestPersonaVerification?.status ?? null,
    activeApprovedDepositAmountCents
  });

  return {
    latestPersonaVerification,
    personaHistory,
    activeDraftDeposit: deposits.find((deposit) => deposit.status === "draft") ?? null,
    deposits: deposits.map((deposit) => ({
      ...deposit,
      proofAssetUrl: buildPublicProofUrl(deposit.proofAssetKey)
    })),
    paymentMethods,
    derivedEligibility,
    isPersonaFlowConfigured: isPersonaFlowConfigured()
  };
}

export async function getAdminDepositReviewSnapshot() {
  const deposits = await prisma.deposit.findMany({
    where: {
      status: {
        in: ["pending_review", "approved", "rejected", "refunded", "forfeited"]
      }
    },
    orderBy: [{ updatedAtUtc: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true
        }
      },
      reviewedByUser: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      },
      sitePaymentMethod: true
    }
  });

  return deposits.map((deposit) => ({
    ...deposit,
    proofAssetUrl: buildPublicProofUrl(deposit.proofAssetKey)
  }));
}

export async function getAdminBidderVerificationRows() {
  const users = await prisma.user.findMany({
    where: {
      role: "bidder"
    },
    orderBy: [{ createdAtUtc: "desc" }],
    select: {
      id: true,
      email: true,
      emailVerifiedAtUtc: true,
      bidderProfile: {
        select: {
          isBlocked: true,
          maxBidTier: true,
          activeHoldAmountCents: true,
          nonPaymentStrikeCount: true
        }
      },
      personaVerifications: {
        orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }],
        take: 1
      },
      deposits: {
        select: {
          amountCents: true,
          status: true
        }
      }
    }
  });

  return users.map((user) => {
    const latestPersonaVerification = user.personaVerifications[0] ?? null;
    const activeApprovedDepositAmountCents = deriveActiveApprovedDepositAmountCents(user.deposits);

    return {
      id: user.id,
      email: user.email,
      emailVerifiedAtUtc: user.emailVerifiedAtUtc,
      bidderProfile: user.bidderProfile,
      latestPersonaVerification,
      derivedEligibility: deriveVerificationEligibility({
        isBlocked: user.bidderProfile?.isBlocked ?? false,
        personaStatus: latestPersonaVerification?.status ?? null,
        activeApprovedDepositAmountCents
      }),
      activeApprovedDepositAmountCents
    };
  });
}

export async function getAdminBidderVerificationDetail(userId: string) {
  const [user, personaVerifications, deposits] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: {
        id: userId
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAtUtc: true,
        bidderProfile: true
      }
    }),
    prisma.personaVerification.findMany({
      where: {
        userId
      },
      orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }],
      take: 10
    }),
    prisma.deposit.findMany({
      where: {
        userId
      },
      orderBy: [{ createdAtUtc: "desc" }],
      take: 20,
      include: {
        sitePaymentMethod: true,
        reviewedByUser: {
          select: {
            email: true,
            displayName: true
          }
        }
      }
    })
  ]);

  const latestPersonaVerification = personaVerifications[0] ?? null;
  const activeApprovedDepositAmountCents = deriveActiveApprovedDepositAmountCents(deposits);

  return {
    ...user,
    latestPersonaVerification,
    personaVerifications,
    derivedEligibility: deriveVerificationEligibility({
      isBlocked: user.bidderProfile?.isBlocked ?? false,
      personaStatus: latestPersonaVerification?.status ?? null,
      activeApprovedDepositAmountCents
    }),
    activeApprovedDepositAmountCents,
    deposits: deposits.map((deposit) => ({
      ...deposit,
      proofAssetUrl: buildPublicProofUrl(deposit.proofAssetKey)
    }))
  };
}

export async function listEnabledDepositPaymentMethods() {
  return prisma.sitePaymentMethod.findMany({
    where: {
      code: {
        in: [...allowedDepositPaymentMethods]
      },
      isEnabled: true
    },
    orderBy: [{ sortOrder: "asc" }]
  });
}

export async function recalculateBidderVerificationState(userId: string) {
  return syncBidderProfileVerificationStateWithClient(prisma, userId);
}

export type EnabledDepositPaymentMethod = SitePaymentMethod;
