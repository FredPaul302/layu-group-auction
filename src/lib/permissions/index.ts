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

export function canParticipateInCommerce(subject: PermissionSubject) {
  if (!isAuthenticated(subject)) {
    return false;
  }

  if (!hasVerifiedEmail(subject)) {
    return false;
  }

  return false;
}
