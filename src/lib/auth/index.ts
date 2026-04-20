import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { canParticipateInCommerce, hasVerifiedEmail, isAdmin } from "@/lib/permissions";

import {
  getAuthCookieName,
  getAuthSecret,
  getCurrentTermsVersion,
  getEmailVerificationTtlHours,
  getPasswordResetTtlHours,
  getSessionTtlHours
} from "./config";
import { sendEmailVerificationMessage, sendPasswordResetMessage } from "./email";
import { hashPassword, verifyPassword } from "./password";
import {
  createSessionCookieValue,
  type SessionCookieSnapshot,
  verifySessionCookieValue
} from "./session-cookie";
import { createOpaqueToken, hashOpaqueToken } from "./tokens";

const authUserSelect = {
  id: true,
  email: true,
  role: true,
  displayName: true,
  acceptedTermsVersion: true,
  acceptedTermsAtUtc: true,
  emailVerifiedAtUtc: true,
  bidderProfile: {
    select: {
      id: true,
      maxBidTier: true,
      activeHoldAmountCents: true,
      isBlocked: true,
      nonPaymentStrikeCount: true
    }
  }
} satisfies Prisma.UserSelect;

type AuthenticatedUser = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

type SessionRecord = {
  sessionToken: string;
  expiresAtUtc: Date;
};

type CookieSource = {
  get(name: string): { value: string } | undefined;
};

export type { AuthenticatedUser };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function isValidPassword(password: string) {
  return password.length >= 8;
}

export function getSafeNextPath(nextPath: string | null | undefined, fallback = "/account") {
  if (!nextPath) {
    return fallback;
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.startsWith("/api/")) {
    return fallback;
  }

  return nextPath;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  };
}

async function createSessionRecord(userId: string): Promise<SessionRecord & { rawSessionToken: string }> {
  const expiresAtUtc = addHours(new Date(), getSessionTtlHours());
  const rawSessionToken = createOpaqueToken();

  const session = await prisma.session.create({
    data: {
      userId,
      sessionToken: hashOpaqueToken(rawSessionToken),
      expiresAtUtc
    },
    select: {
      sessionToken: true,
      expiresAtUtc: true
    }
  });

  return {
    rawSessionToken,
    sessionToken: session.sessionToken,
    expiresAtUtc: session.expiresAtUtc
  };
}

function toSessionSnapshot(
  user: Pick<AuthenticatedUser, "id" | "role" | "emailVerifiedAtUtc">,
  rawSessionToken: string,
  expiresAtUtc: Date
): SessionCookieSnapshot {
  return {
    sessionToken: rawSessionToken,
    userId: user.id,
    role: user.role,
    emailVerified: hasVerifiedEmail(user),
    expiresAtUnix: Math.floor(expiresAtUtc.getTime() / 1000)
  };
}

async function readSessionSnapshot(cookieSource: CookieSource) {
  const cookieValue = cookieSource.get(getAuthCookieName())?.value;

  if (!cookieValue) {
    return null;
  }

  return verifySessionCookieValue(cookieValue, getAuthSecret());
}

export async function getSessionSnapshotFromRequestCookies(cookieSource: CookieSource) {
  return readSessionSnapshot(cookieSource);
}

async function findUserForSession(snapshot: SessionCookieSnapshot) {
  const session = await prisma.session.findUnique({
    where: {
      sessionToken: hashOpaqueToken(snapshot.sessionToken)
    },
    select: {
      userId: true,
      expiresAtUtc: true,
      user: {
        select: authUserSelect
      }
    }
  });

  if (!session) {
    return null;
  }

  if (session.userId !== snapshot.userId || session.expiresAtUtc.getTime() <= Date.now()) {
    return null;
  }

  return {
    expiresAtUtc: session.expiresAtUtc,
    user: session.user
  };
}

export async function getCurrentUserFromCookieSource(cookieSource: CookieSource) {
  const snapshot = await readSessionSnapshot(cookieSource);

  if (!snapshot) {
    return null;
  }

  const session = await findUserForSession(snapshot);

  if (!session) {
    return null;
  }

  return session.user;
}

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  return getCurrentUserFromCookieSource(cookieStore);
});

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return user;
}

export async function requireAdminUser() {
  const user = await requireAuthenticatedUser();

  if (!isAdmin(user)) {
    redirect("/account");
  }

  return user;
}

export async function createSignedSessionCookie(user: AuthenticatedUser) {
  const session = await createSessionRecord(user.id);
  const snapshot = toSessionSnapshot(user, session.rawSessionToken, session.expiresAtUtc);
  const cookieValue = await createSessionCookieValue(snapshot, getAuthSecret());

  return {
    cookieName: getAuthCookieName(),
    cookieOptions: getSessionCookieOptions(session.expiresAtUtc),
    cookieValue,
    snapshot
  };
}

export async function refreshSignedSessionCookieFromSnapshot(
  snapshot: SessionCookieSnapshot,
  user: Pick<AuthenticatedUser, "id" | "role" | "emailVerifiedAtUtc">
) {
  const refreshedSnapshot = toSessionSnapshot(
    user,
    snapshot.sessionToken,
    new Date(snapshot.expiresAtUnix * 1000)
  );

  return {
    cookieName: getAuthCookieName(),
    cookieOptions: getSessionCookieOptions(new Date(refreshedSnapshot.expiresAtUnix * 1000)),
    cookieValue: await createSessionCookieValue(refreshedSnapshot, getAuthSecret())
  };
}

export function getExpiredSessionCookie() {
  return {
    cookieName: getAuthCookieName(),
    cookieOptions: {
      ...getSessionCookieOptions(new Date(0)),
      expires: new Date(0),
      maxAge: 0
    },
    cookieValue: ""
  };
}

export async function deleteCurrentSession(cookieSource: CookieSource) {
  const snapshot = await readSessionSnapshot(cookieSource);

  if (!snapshot) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      sessionToken: hashOpaqueToken(snapshot.sessionToken)
    }
  });
}

export async function registerUser(input: {
  email: string;
  displayName?: string;
  password: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const acceptedTermsAtUtc = new Date();

  return prisma.user.create({
    data: {
      email: input.email.trim(),
      normalizedEmail,
      passwordHash,
      displayName: input.displayName?.trim() || null,
      role: "bidder",
      acceptedTermsVersion: getCurrentTermsVersion(),
      acceptedTermsAtUtc,
      bidderProfile: {
        create: {
          maxBidTier: "tier_0",
          activeHoldAmountCents: 0,
          isBlocked: false,
          nonPaymentStrikeCount: 0
        }
      }
    },
    select: authUserSelect
  });
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: {
      normalizedEmail
    },
    select: {
      ...authUserSelect,
      passwordHash: true
    }
  });

  if (!user?.passwordHash) {
    return null;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;

  return safeUser;
}

export async function issueEmailVerification(user: Pick<AuthenticatedUser, "id" | "email">) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAtUtc = addHours(new Date(), getEmailVerificationTtlHours());

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({
      where: {
        userId: user.id
      }
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAtUtc
      }
    })
  ]);

  await sendEmailVerificationMessage({
    email: user.email,
    token
  });
}

export async function issuePasswordReset(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: {
      normalizedEmail
    },
    select: {
      id: true,
      email: true,
      passwordHash: true
    }
  });

  if (!user?.passwordHash) {
    return;
  }

  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAtUtc = addHours(new Date(), getPasswordResetTtlHours());

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id
      }
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAtUtc
      }
    })
  ]);

  await sendPasswordResetMessage({
    email: user.email,
    token
  });
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const existingToken = await prisma.emailVerificationToken.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      userId: true,
      email: true,
      expiresAtUtc: true,
      consumedAtUtc: true,
      user: {
        select: authUserSelect
      }
    }
  });

  if (!existingToken || existingToken.consumedAtUtc) {
    return {
      status: "invalid" as const
    };
  }

  if (existingToken.expiresAtUtc.getTime() <= Date.now()) {
    return {
      status: "expired" as const
    };
  }

  const now = new Date();
  const user = await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.update({
      where: {
        id: existingToken.id
      },
      data: {
        consumedAtUtc: now
      }
    });

    return transaction.user.update({
      where: {
        id: existingToken.userId
      },
      data: {
        emailVerifiedAtUtc: existingToken.user.emailVerifiedAtUtc ?? now
      },
      select: authUserSelect
    });
  });

  return {
    status: "verified" as const,
    user
  };
}

export async function consumePasswordResetToken(input: {
  token: string;
  password: string;
}) {
  const tokenHash = hashOpaqueToken(input.token);
  const existingToken = await prisma.passwordResetToken.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      userId: true,
      expiresAtUtc: true,
      consumedAtUtc: true
    }
  });

  if (!existingToken || existingToken.consumedAtUtc) {
    return {
      status: "invalid" as const
    };
  }

  if (existingToken.expiresAtUtc.getTime() <= Date.now()) {
    return {
      status: "expired" as const
    };
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: {
        id: existingToken.userId
      },
      data: {
        passwordHash
      }
    });

    await transaction.passwordResetToken.update({
      where: {
        id: existingToken.id
      },
      data: {
        consumedAtUtc: now
      }
    });

    await transaction.session.deleteMany({
      where: {
        userId: existingToken.userId
      }
    });
  });

  return {
    status: "reset" as const
  };
}

export async function canCurrentUserParticipateInCommerce() {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return canParticipateInCommerce(user);
}
