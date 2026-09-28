import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeVerificationPolicy, parseVerificationPolicyInput } from "./policy";
import { parseAnnouncementVideo } from "./announcement-video";

export async function getVerificationPolicy(db: Prisma.TransactionClient | PrismaClient = prisma) {
  const setting = await db.siteSetting.findUnique({
    where: { id: 1 },
    select: { verificationLevel: true, emailOnlyLimitCents: true, launchAccessEnabled: true,
      depositTier1Cents: true, depositTier2Cents: true, launchAuctionLimitCents: true }
  });
  return normalizeVerificationPolicy(setting);
}

export async function getHomepageVideoUrl() {
  const setting = await prisma.siteSetting.findUnique({ where: { id: 1 }, select: { homepageVideoUrl: true } });
  return setting?.homepageVideoUrl ?? null;
}

export async function updateVerificationPolicy(input: Parameters<typeof parseVerificationPolicyInput>[0] & { homepageVideoUrl?: unknown }) {
  const policy = parseVerificationPolicyInput(input);
  const homepageVideoUrl = input.homepageVideoUrl === undefined ? undefined : parseAnnouncementVideo(input.homepageVideoUrl)?.url ?? null;
  await prisma.siteSetting.update({ where: { id: 1 }, data: { ...policy, ...(homepageVideoUrl !== undefined ? { homepageVideoUrl } : {}) } });
  return policy;
}
