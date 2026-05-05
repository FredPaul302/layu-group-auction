import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentMethodCode,
  Prisma,
  type PrismaClient,
  type SitePaymentMethod
} from "@prisma/client";

import { createOpaqueToken } from "@/lib/auth/tokens";
import { AppEnvError } from "@/lib/config/env-error";
import {
  getIdentityVerificationEnv,
  isActiveIdentityProviderConfigured,
  requireDiditSessionConfig,
  requireDiditWebhookSecret
} from "@/lib/config/identity-verification-env";
import { getPersonaEnv } from "@/lib/config/persona-env";
import { prisma } from "@/lib/prisma";

import { createDiditHostedSession } from "./didit-client";
import { verifyDiditWebhookSignature as verifyDiditWebhookSignaturePayload } from "./didit-webhook";
import {
  canApplyDepositReviewDecision,
  deriveActiveApprovedDepositAmountCents,
  deriveBidTierFromActiveHoldAmount,
  deriveVerificationEligibility,
  isSupportedDepositAmount,
  mapDepositReviewDecisionToStatus,
  type DepositReviewDecision,
  VerificationActionError
} from "./index";

type VerificationDbClient = Prisma.TransactionClient | PrismaClient;

const allowedDepositPaymentMethods = [
  PaymentMethodCode.paypal,
  PaymentMethodCode.venmo,
  PaymentMethodCode.cash_app
] as const;

function getPersonaTemplateId() {
  return getPersonaEnv().persona.templateId;
}

function getPersonaEnvironmentId() {
  return getPersonaEnv().persona.environmentId;
}

function getPersonaSubdomain() {
  return getPersonaEnv().persona.subdomain;
}

function getPersonaWebhookSecret() {
  return getPersonaEnv().persona.webhookSecret;
}

function buildIdentityVerificationReferenceId(userId: string) {
  return `layu-user:${userId}`;
}

function buildPersonaReferenceId(userId: string) {
  return buildIdentityVerificationReferenceId(userId);
}

function parseUserIdFromIdentityVerificationReferenceId(referenceId: string | null | undefined) {
  if (!referenceId?.startsWith("layu-user:")) {
    return null;
  }

  return referenceId.slice("layu-user:".length) || null;
}

function parseUserIdFromPersonaReferenceId(referenceId: string | null | undefined) {
  return parseUserIdFromIdentityVerificationReferenceId(referenceId);
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
    new URL(
      "/api/verifications/persona/callback",
      getPersonaEnv().app.url
    ).toString()
  );

  const environmentId = getPersonaEnvironmentId();

  if (environmentId) {
    url.searchParams.set("environment-id", environmentId);
  }

  return url.toString();
}

function buildDiditCallbackUrl() {
  return new URL(
    "/api/verifications/didit/callback",
    getIdentityVerificationEnv().app.url
  ).toString();
}

function buildDepositProofUrl(depositId: string, proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return null;
  }

  return `/api/verifications/deposit/${depositId}/proof`;
}

async function getVerificationStorageAdapter() {
  const { getStorageAdapter } = await import("@/lib/storage");

  return getStorageAdapter();
}

async function removeStoredProofAsset(proofAssetKey: string | null) {
  if (!proofAssetKey) {
    return;
  }

  try {
    const storageAdapter = await getVerificationStorageAdapter();

    await storageAdapter.remove(proofAssetKey);
  } catch (error) {
    console.error("Stored verification proof cleanup failed.", error);
  }
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

async function syncBidderRestrictionStateWithClient(
  db: VerificationDbClient,
  userId: string
) {
  const activeFlags = await db.bidderFlag.findMany({
    where: {
      bidderProfile: {
        userId
      },
      isActive: true,
      flagType: {
        in: ["blocked", "non_paying"]
      }
    },
    orderBy: [{ createdAtUtc: "desc" }]
  });

  const activeBlockedFlag = activeFlags.find((flag) => flag.flagType === "blocked") ?? null;
  const activeNonPayingFlags = activeFlags.filter((flag) => flag.flagType === "non_paying");

  return db.bidderProfile.upsert({
    where: {
      userId
    },
    update: {
      isBlocked: Boolean(activeBlockedFlag),
      blockedAtUtc: activeBlockedFlag?.createdAtUtc ?? null,
      blockReason: activeBlockedFlag?.reason ?? null,
      nonPaymentStrikeCount: activeNonPayingFlags.length,
      lastNonPaymentAtUtc: activeNonPayingFlags[0]?.createdAtUtc ?? null
    },
    create: {
      userId,
      maxBidTier: "tier_0",
      activeHoldAmountCents: 0,
      isBlocked: Boolean(activeBlockedFlag),
      blockedAtUtc: activeBlockedFlag?.createdAtUtc ?? null,
      blockReason: activeBlockedFlag?.reason ?? null,
      nonPaymentStrikeCount: activeNonPayingFlags.length,
      lastNonPaymentAtUtc: activeNonPayingFlags[0]?.createdAtUtc ?? null
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

function mapDiditStatusToLocalStatus(status: string | null | undefined) {
  switch (status) {
    case "Approved":
      return "approved" as const;
    case "Declined":
      return "rejected" as const;
    case "Abandoned":
    case "Expired":
      return "expired" as const;
    case "In Review":
    case "In Progress":
    case "Not Started":
    default:
      return "pending" as const;
  }
}

function parseDiditWebhookTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  if (typeof value === "string") {
    const numericValue = Number.parseInt(value, 10);

    if (Number.isFinite(numericValue)) {
      return new Date(numericValue * 1000);
    }

    const dateValue = new Date(value);

    if (!Number.isNaN(dateValue.getTime())) {
      return dateValue;
    }
  }

  return new Date();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

  const existingPending = await prisma.personaVerification.findFirst({
    where: {
      userId,
      status: "pending"
    },
    orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }]
  });

  if (existingPending) {
    return {
      status: "already_pending" as const,
      redirectUrl
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
}) {
  const occurredAtUtc = new Date();

  await upsertPersonaVerificationRecord({
    inquiryId: input.inquiryId,
    referenceId: input.referenceId,
    verificationTemplateId: getPersonaTemplateId(),
    status: "pending",
    decisionSummary: "Hosted Persona flow returned; awaiting signed webhook decision.",
    occurredAtUtc
  });

  return "pending" as const;
}

export function getActiveIdentityVerificationProvider() {
  return getIdentityVerificationEnv().identityVerification.provider;
}

export function isIdentityVerificationFlowConfigured() {
  return isActiveIdentityProviderConfigured();
}

export async function startDiditVerificationFlow(userId: string) {
  let config: ReturnType<typeof requireDiditSessionConfig>;

  try {
    config = requireDiditSessionConfig();
  } catch (error) {
    if (error instanceof AppEnvError) {
      return {
        status: "not_configured" as const
      };
    }

    throw error;
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

  const existingPending = await prisma.personaVerification.findFirst({
    where: {
      userId,
      status: "pending"
    },
    orderBy: [{ submittedAtUtc: "desc" }, { createdAtUtc: "desc" }]
  });

  if (existingPending?.inquiryId) {
    return {
      status: "already_pending" as const
    };
  }

  const referenceId = buildIdentityVerificationReferenceId(userId);
  const session = await createDiditHostedSession({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    callback: buildDiditCallbackUrl(),
    vendorData: referenceId,
    workflowId: config.workflowId
  });
  const occurredAtUtc = new Date();

  await upsertPersonaVerificationRecord({
    inquiryId: session.sessionId,
    referenceId,
    verificationTemplateId: session.workflowId,
    status: "pending",
    decisionSummary: "Hosted Didit identity verification flow started.",
    occurredAtUtc
  });

  return {
    status: "redirect" as const,
    redirectUrl: session.redirectUrl
  };
}

export async function syncDiditHostedReturn(input: {
  verificationSessionId: string;
}) {
  await upsertPersonaVerificationRecord({
    inquiryId: input.verificationSessionId,
    referenceId: null,
    verificationTemplateId: getIdentityVerificationEnv().didit.workflowId,
    status: "pending",
    decisionSummary: "Hosted Didit flow returned; awaiting signed webhook decision.",
    occurredAtUtc: new Date()
  });

  return "pending" as const;
}

export function verifyDiditWebhookSignature(input: {
  payload: unknown;
  signatureSimple: string | null;
  signatureV2: string | null;
  timestamp: string | null;
}) {
  const secret = requireDiditWebhookSecret();

  return verifyDiditWebhookSignaturePayload({
    headers: {
      signatureSimple: input.signatureSimple,
      signatureV2: input.signatureV2,
      timestamp: input.timestamp
    },
    payload: input.payload,
    secret
  });
}

export async function processDiditWebhookPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return {
      status: "ignored" as const
    };
  }

  const webhookEvent = payload as {
    created_at?: unknown;
    session_id?: string;
    status?: string;
    timestamp?: unknown;
    vendor_data?: string;
    webhook_type?: string;
    workflow_id?: string;
  };
  const sessionId = webhookEvent.session_id ?? null;
  const referenceId = webhookEvent.vendor_data ?? null;
  const localStatus = mapDiditStatusToLocalStatus(webhookEvent.status);

  if (!sessionId) {
    return {
      status: "ignored" as const
    };
  }

  const personaVerification = await upsertPersonaVerificationRecord({
    inquiryId: sessionId,
    referenceId,
    verificationTemplateId: webhookEvent.workflow_id ?? null,
    status: localStatus,
    decisionSummary: `Didit webhook processed: ${webhookEvent.status ?? "unknown"}.`,
    occurredAtUtc: parseDiditWebhookTimestamp(
      webhookEvent.timestamp ?? webhookEvent.created_at
    )
  });

  if (!personaVerification) {
    return {
      status: "ignored" as const
    };
  }

  return {
    status: "processed" as const,
    sessionId,
    localStatus,
    webhookType: webhookEvent.webhook_type ?? null
  };
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
  const env = getPersonaEnv();
  const secret = getPersonaWebhookSecret();

  if (!secret && env.runtime.isProduction) {
    throw new AppEnvError(
      "PERSONA_WEBHOOK_SECRET is required to verify Persona webhooks in production.",
      "PERSONA_WEBHOOK_SECRET"
    );
  }

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
    throw new VerificationActionError(
      "deposit_amount_invalid",
      400,
      "Unsupported deposit tier amount."
    );
  }

  const sitePaymentMethod = await findEnabledDepositPaymentMethod(input.paymentMethodCode);

  if (!sitePaymentMethod) {
    throw new VerificationActionError(
      "deposit_method_invalid",
      400,
      "Unsupported payment method."
    );
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
  const payerHandle = input.payerHandle.trim();
  const externalReference = input.externalReference.trim();

  if (!payerHandle || !externalReference) {
    throw new VerificationActionError(
      "deposit_submission_invalid",
      400,
      "Deposit submissions require both payer handle and payment reference details."
    );
  }

  const existingDeposit = await prisma.deposit.findFirst({
    where: {
      id: input.depositId,
      userId: input.userId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!existingDeposit) {
    throw new VerificationActionError(
      "deposit_submission_not_found",
      404,
      "Deposit submission was not found."
    );
  }

  if (existingDeposit.status !== "draft") {
    throw new VerificationActionError(
      "deposit_already_submitted",
      409,
      "This deposit has already been submitted or reviewed."
    );
  }

  let proofAssetKey: string | null = null;

  try {
    if (input.screenshotFile && input.screenshotFile.size > 0) {
      if (!input.screenshotFile.type.startsWith("image/")) {
        throw new VerificationActionError(
          "deposit_submission_invalid",
          400,
          "Only image screenshots are supported."
        );
      }

      const storageAdapter = await getVerificationStorageAdapter();
      const buffer = Buffer.from(await input.screenshotFile.arrayBuffer());
      const storedAsset = await storageAdapter.save({
        fileName: input.screenshotFile.name || "deposit-proof",
        contentType: input.screenshotFile.type,
        body: buffer
      });

      proofAssetKey = storedAsset.key;
    }

    const updated = await prisma.deposit.updateMany({
      where: {
        id: existingDeposit.id,
        userId: input.userId,
        status: "draft"
      },
      data: {
        payerHandle,
        externalReference,
        proofAssetKey,
        status: "pending_review",
        submittedAtUtc: new Date()
      }
    });

    if (updated.count !== 1) {
      throw new VerificationActionError(
        "deposit_already_submitted",
        409,
        "This deposit has already been submitted or reviewed."
      );
    }

    return prisma.deposit.findUniqueOrThrow({
      where: {
        id: existingDeposit.id
      },
      include: {
        sitePaymentMethod: true
      }
    });
  } catch (error) {
    await removeStoredProofAsset(proofAssetKey);
    throw error;
  }
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
      throw new VerificationActionError(
        "deposit_submission_not_found",
        404,
        "Deposit could not be found."
      );
    }

    if (!canApplyDepositReviewDecision(deposit.status, input.decision)) {
      throw new VerificationActionError(
        "deposit_review_invalid",
        409,
        "That review decision is not valid for the current deposit status."
      );
    }

    const updated = await transaction.deposit.updateMany({
      where: {
        id: deposit.id,
        status: deposit.status
      },
      data: {
        status: mapDepositReviewDecisionToStatus(input.decision),
        reviewedByUserId: input.reviewedByUserId,
        reviewedAtUtc: new Date(),
        reviewNotes: input.reviewNotes.trim() || null
      }
    });

    if (updated.count !== 1) {
      throw new VerificationActionError(
        "deposit_review_invalid",
        409,
        "That review decision is no longer valid for the current deposit status."
      );
    }

    const updatedDeposit = await transaction.deposit.findUniqueOrThrow({
      where: {
        id: deposit.id
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
            activeHoldAmountCents: true,
            nonPaymentStrikeCount: true
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
    nonPaymentStrikeCount: user.bidderProfile?.nonPaymentStrikeCount ?? 0,
    personaStatus: latestPersonaVerification?.status ?? null,
    activeApprovedDepositAmountCents
  });

  return {
    latestPersonaVerification,
    personaHistory,
    activeDraftDeposit: deposits.find((deposit) => deposit.status === "draft") ?? null,
    deposits: deposits.map((deposit) => ({
      ...deposit,
      proofAssetUrl: buildDepositProofUrl(deposit.id, deposit.proofAssetKey)
    })),
    paymentMethods,
    derivedEligibility,
    identityVerificationProvider: getActiveIdentityVerificationProvider(),
    isIdentityVerificationFlowConfigured: isIdentityVerificationFlowConfigured(),
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
    proofAssetUrl: buildDepositProofUrl(deposit.id, deposit.proofAssetKey)
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
      depositsSubmitted: {
        select: {
          amountCents: true,
          status: true
        }
      }
    }
  });

  return users.map((user) => {
    const latestPersonaVerification = user.personaVerifications[0] ?? null;
    const activeApprovedDepositAmountCents = deriveActiveApprovedDepositAmountCents(
      user.depositsSubmitted
    );

    return {
      id: user.id,
      email: user.email,
      emailVerifiedAtUtc: user.emailVerifiedAtUtc,
      bidderProfile: user.bidderProfile,
      latestPersonaVerification,
      derivedEligibility: deriveVerificationEligibility({
        isBlocked: user.bidderProfile?.isBlocked ?? false,
        nonPaymentStrikeCount: user.bidderProfile?.nonPaymentStrikeCount ?? 0,
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
        bidderProfile: {
          include: {
            flags: {
              orderBy: [{ createdAtUtc: "desc" }],
              include: {
                createdByUser: {
                  select: {
                    email: true,
                    displayName: true
                  }
                }
              }
            }
          }
        }
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
      nonPaymentStrikeCount: user.bidderProfile?.nonPaymentStrikeCount ?? 0,
      personaStatus: latestPersonaVerification?.status ?? null,
      activeApprovedDepositAmountCents
    }),
    activeApprovedDepositAmountCents,
    deposits: deposits.map((deposit) => ({
      ...deposit,
      proofAssetUrl: buildDepositProofUrl(deposit.id, deposit.proofAssetKey)
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

export async function applyBidderRestrictionFlag(input: {
  userId: string;
  flagType: "blocked" | "non_paying";
  createdByUserId: string;
  reason: string;
}) {
  const reason = input.reason.trim();

  if (!reason) {
    throw new VerificationActionError(
      "bidder_flag_reason_required",
      400,
      "A reason is required for bidder restriction flags."
    );
  }

  return prisma.$transaction(async (transaction) => {
    const bidderProfile = await transaction.bidderProfile.upsert({
      where: {
        userId: input.userId
      },
      update: {},
      create: {
        userId: input.userId,
        maxBidTier: "tier_0",
        activeHoldAmountCents: 0,
        isBlocked: false,
        nonPaymentStrikeCount: 0
      }
    });

    const existingFlag = await transaction.bidderFlag.findFirst({
      where: {
        bidderProfileId: bidderProfile.id,
        flagType: input.flagType,
        isActive: true
      }
    });

    const flag =
      existingFlag ??
      (await transaction.bidderFlag.create({
        data: {
          bidderProfileId: bidderProfile.id,
          createdByUserId: input.createdByUserId,
          flagType: input.flagType,
          reason
        }
      }));

    await syncBidderRestrictionStateWithClient(transaction, input.userId);

    return flag;
  });
}

export async function clearBidderRestrictionFlag(input: {
  userId: string;
  flagType: "blocked" | "non_paying";
}) {
  return prisma.$transaction(async (transaction) => {
    const bidderProfile = await transaction.bidderProfile.findUnique({
      where: {
        userId: input.userId
      }
    });

    if (!bidderProfile) {
      return null;
    }

    await transaction.bidderFlag.updateMany({
      where: {
        bidderProfileId: bidderProfile.id,
        flagType: input.flagType,
        isActive: true
      },
      data: {
        isActive: false,
        resolvedAtUtc: new Date()
      }
    });

    return syncBidderRestrictionStateWithClient(transaction, input.userId);
  });
}

export type EnabledDepositPaymentMethod = SitePaymentMethod;
