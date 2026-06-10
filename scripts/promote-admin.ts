import { pathToFileURL } from "node:url";

import { BidTier, PrismaClient, UserRole } from "@prisma/client";

type ExistingUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  role: UserRole;
  emailVerifiedAtUtc: Date | null;
};

type DbCallArgs = Record<string, unknown>;

export type AdminPromotionClient = {
  user: {
    findUnique(args: DbCallArgs): Promise<ExistingUser | null>;
    update(args: DbCallArgs): Promise<ExistingUser>;
  };
  bidderProfile: {
    upsert(args: DbCallArgs): Promise<unknown>;
  };
  $transaction<T>(callback: (transaction: AdminPromotionClient) => Promise<T>): Promise<T>;
};

export type AdminPromotionInput = {
  email: string;
  verifyEmail?: boolean;
};

export type AdminPromotionResult =
  | {
      status: "already_admin";
      email: string;
      userId: string;
    }
  | {
      status: "promoted";
      email: string;
      userId: string;
    }
  | {
      status: "verified";
      email: string;
      userId: string;
    }
  | {
      status: "already_verified";
      email: string;
      userId: string;
    }
  | {
      status: "promoted_and_verified";
      email: string;
      userId: string;
    }
  | {
      status: "promoted_with_verified_email";
      email: string;
      userId: string;
    };

type EnvShape = Record<string, string | undefined>;

type CliOptions = {
  email?: string;
  confirmProductionPromotion: boolean;
  verifyEmail: boolean;
  help: boolean;
};

type AdminPromotionCliDependencies = {
  client?: AdminPromotionClient & {
    $disconnect?: () => Promise<void>;
  };
  env?: EnvShape;
  stdout?: (message: string) => void;
};

export class AdminPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminPromotionError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function assertValidAdminPromotionInput(input: AdminPromotionInput) {
  const normalizedEmail = normalizeEmail(input.email);

  if (!isValidEmail(normalizedEmail)) {
    throw new AdminPromotionError("Provide a valid user email address to promote.");
  }
}

export function assertAdminPromotionAllowed(
  options: Pick<CliOptions, "confirmProductionPromotion">,
  env: EnvShape = process.env
) {
  if (!options.confirmProductionPromotion) {
    throw new AdminPromotionError(
      "Refusing to promote an admin without --confirm-production-promotion."
    );
  }

  if (env.NODE_ENV === "production" && env.ALLOW_ADMIN_PROMOTE !== "1") {
    throw new AdminPromotionError(
      "Set ALLOW_ADMIN_PROMOTE=1 to run admin promotion in production."
    );
  }
}

export function assertDatabaseUrlConfigured(env: EnvShape = process.env) {
  if (!env.DATABASE_URL?.trim()) {
    throw new AdminPromotionError("DATABASE_URL is required to promote an admin user.");
  }
}

export async function promoteExistingUserToAdmin(
  client: AdminPromotionClient,
  input: AdminPromotionInput,
  options: {
    now?: Date;
  } = {}
): Promise<AdminPromotionResult> {
  assertValidAdminPromotionInput(input);

  const normalizedEmail = normalizeEmail(input.email);
  const now = options.now ?? new Date();
  const existingUser = await client.user.findUnique({
    where: {
      normalizedEmail
    },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      role: true,
      emailVerifiedAtUtc: true
    }
  });

  if (!existingUser) {
    throw new AdminPromotionError(
      `No existing user found for ${normalizedEmail}. This script only promotes existing users.`
    );
  }

  const alreadyAdmin = existingUser.role === UserRole.admin;
  const alreadyVerified = Boolean(existingUser.emailVerifiedAtUtc);
  const shouldVerifyEmail = Boolean(input.verifyEmail);

  if (alreadyAdmin && !shouldVerifyEmail) {
    return {
      status: "already_admin",
      email: existingUser.email,
      userId: existingUser.id
    };
  }

  if (alreadyAdmin && shouldVerifyEmail && alreadyVerified) {
    return {
      status: "already_verified",
      email: existingUser.email,
      userId: existingUser.id
    };
  }

  return client.$transaction(async (transaction) => {
    const userUpdateData: {
      role?: UserRole;
      emailVerifiedAtUtc?: Date;
    } = {};

    if (!alreadyAdmin) {
      userUpdateData.role = UserRole.admin;
    }

    if (shouldVerifyEmail && !alreadyVerified) {
      userUpdateData.emailVerifiedAtUtc = now;
    }

    const updatedUser = await transaction.user.update({
      where: {
        id: existingUser.id
      },
      data: userUpdateData,
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        role: true,
        emailVerifiedAtUtc: true
      }
    });

    if (!alreadyAdmin) {
      await transaction.bidderProfile.upsert({
        where: {
          userId: updatedUser.id
        },
        update: {
          maxBidTier: BidTier.full,
          activeHoldAmountCents: 0,
          isBlocked: false,
          blockedAtUtc: null,
          blockReason: null,
          nonPaymentStrikeCount: 0,
          lastNonPaymentAtUtc: null
        },
        create: {
          userId: updatedUser.id,
          maxBidTier: BidTier.full,
          activeHoldAmountCents: 0,
          isBlocked: false,
          nonPaymentStrikeCount: 0
        }
      });
    }

    if (!alreadyAdmin && shouldVerifyEmail && !alreadyVerified) {
      return {
        status: "promoted_and_verified",
        email: updatedUser.email,
        userId: updatedUser.id
      };
    }

    if (!alreadyAdmin && shouldVerifyEmail && alreadyVerified) {
      return {
        status: "promoted_with_verified_email",
        email: updatedUser.email,
        userId: updatedUser.id
      };
    }

    if (!alreadyAdmin) {
      return {
        status: "promoted",
        email: updatedUser.email,
        userId: updatedUser.id
      };
    }

    return {
      status: "verified",
      email: updatedUser.email,
      userId: updatedUser.id
    };
  });
}

export function parseAdminPromoteArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    confirmProductionPromotion: false,
    verifyEmail: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--confirm-production-promotion") {
      options.confirmProductionPromotion = true;
      continue;
    }

    if (arg === "--verify-email") {
      options.verifyEmail = true;
      continue;
    }

    if (arg === "--email") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new AdminPromotionError("--email requires a value.");
      }

      options.email = value;
      index += 1;
      continue;
    }

    throw new AdminPromotionError(`Unknown option: ${arg}`);
  }

  return options;
}

function getUsage() {
  return [
    "Usage:",
    "  pnpm admin:promote -- --email operator@yourdomain.com --confirm-production-promotion",
    "",
    "Options:",
    "  --email <email>                       Required existing user email.",
    "  --confirm-production-promotion        Required explicit operator confirmation.",
    "  --verify-email                        Also mark the existing user's email verified.",
    "  --help                                Show this help text.",
    "",
    "This script only promotes an existing user. It never creates users and never reads or changes passwords.",
    "When NODE_ENV=production, set ALLOW_ADMIN_PROMOTE=1 as an additional operator gate."
  ].join("\n");
}

export async function runAdminPromoteCli(
  args: string[],
  dependencies: AdminPromotionCliDependencies = {}
): Promise<AdminPromotionResult | { status: "help" }> {
  const options = parseAdminPromoteArgs(args);
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? console.log;

  if (options.help) {
    stdout(getUsage());
    return {
      status: "help"
    };
  }

  if (!options.email) {
    throw new AdminPromotionError("--email is required.");
  }

  assertAdminPromotionAllowed(options, env);
  assertValidAdminPromotionInput({
    email: options.email
  });
  assertDatabaseUrlConfigured(env);

  const client =
    dependencies.client ??
    (new PrismaClient() as unknown as AdminPromotionClient & {
      $disconnect(): Promise<void>;
    });

  try {
    const result = await promoteExistingUserToAdmin(client, {
      email: options.email,
      verifyEmail: options.verifyEmail
    });

    if (result.status === "already_admin") {
      stdout(`Admin already exists for ${result.email}; no changes were made.`);
      return result;
    }

    if (result.status === "already_verified") {
      stdout(`Admin already exists and email is already verified for ${result.email}; no changes were made.`);
      return result;
    }

    if (result.status === "verified") {
      stdout(`Existing admin email marked verified: ${result.email}`);
      return result;
    }

    if (result.status === "promoted_and_verified") {
      stdout(`Existing user promoted to admin and email marked verified: ${result.email}`);
      return result;
    }

    if (result.status === "promoted_with_verified_email") {
      stdout(`Existing user promoted to admin; email was already verified: ${result.email}`);
      return result;
    }

    stdout(`Existing user promoted to admin: ${result.email}`);
    return result;
  } finally {
    if (!dependencies.client) {
      await client.$disconnect?.();
    }
  }
}

function isDirectExecution() {
  const scriptPath = process.argv[1];

  return Boolean(scriptPath && import.meta.url === pathToFileURL(scriptPath).href);
}

if (isDirectExecution()) {
  runAdminPromoteCli(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof AdminPromotionError) {
      console.error(error.message);
    } else {
      console.error("Admin promotion failed. Check DATABASE_URL and database connectivity.");
    }

    process.exitCode = 1;
  });
}
