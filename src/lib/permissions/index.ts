import type { BidTier, UserRole } from "@prisma/client";

export type PermissionSubject =
  | {
      id?: string;
      role: UserRole;
      emailVerifiedAtUtc?: Date | string | null;
      bidderProfile?:
        | {
            isBlocked: boolean;
            maxBidTier: BidTier;
            nonPaymentStrikeCount?: number;
          }
        | null;
    }
  | null
  | undefined;

export function isAuthenticated(subject: PermissionSubject): subject is NonNullable<PermissionSubject> {
  return Boolean(subject?.id);
}

export function isAdmin(subject: PermissionSubject) {
  return subject?.role === "admin";
}

export function hasVerifiedEmail(subject: PermissionSubject) {
  return Boolean(subject?.emailVerifiedAtUtc);
}

export function isCommerceRestricted(subject: PermissionSubject) {
  return Boolean(
    subject?.bidderProfile?.isBlocked ||
      (subject?.bidderProfile?.nonPaymentStrikeCount ?? 0) > 0
  );
}

export function canParticipateInCommerce(subject: PermissionSubject) {
  if (!isAuthenticated(subject)) {
    return false;
  }

  if (!hasVerifiedEmail(subject)) {
    return false;
  }

  if (!subject.bidderProfile) {
    return false;
  }

  if (subject.bidderProfile.maxBidTier === "tier_0") {
    return false;
  }

  return !isCommerceRestricted(subject);
}
