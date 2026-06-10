import { pathToFileURL } from "node:url";

import { BidTier, PrismaClient, UserRole } from "@prisma/client";

type ExistingUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  role: UserRole;
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
    };

type EnvShape = Record<string, string | undefined>;

type CliOptions = {
  email?: string;
  confirmProductionPromotion: boolean;
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
  input: AdminPromotionInput
): Promise<AdminPromotionResult> {
  assertValidAdminPromotionInput(input);

  const normalizedEmail = normalizeEmail(input.email);
  const existingUser = await client.user.findUnique({
    where: {
      normalizedEmail
    },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      role: true
    }
  });

  if (!existingUser) {
    throw new AdminPromotionError(
      `No existing user found for ${normalizedEmail}. This script only promotes existing users.`
    );
  }

  if (existingUser.role === UserRole.admin) {
    return {
      status: "already_admin",
      email: existingUser.email,
      userId: existingUser.id
    };
  }

  return client.$transaction(async (transaction) => {
    const promotedUser = await transaction.user.update({
      where: {
        id: existingUser.id
      },
      data: {
        // Admin access is role-based, so promotion keeps email verification state unchanged.
        role: UserRole.admin
      },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        role: true
      }
    });

    await transaction.bidderProfile.upsert({
      where: {
        userId: promotedUser.id
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
        userId: promotedUser.id,
        maxBidTier: BidTier.full,
        activeHoldAmountCents: 0,
        isBlocked: false,
        nonPaymentStrikeCount: 0
      }
    });

    return {
      status: "promoted",
      email: promotedUser.email,
      userId: promotedUser.id
    };
  });
}

export function parseAdminPromoteArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    confirmProductionPromotion: false,
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
      email: options.email
    });

    if (result.status === "already_admin") {
      stdout(`Admin already exists for ${result.email}; no changes were made.`);
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
