import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { BidTier, PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password.js";

const DEFAULT_TERMS_VERSION = "v1";
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const LOCAL_FIXTURE_EMAILS = new Set([
  "admin@local.layu.test",
  "bidder@local.layu.test"
]);
const RESERVED_PLACEHOLDER_EMAILS = new Set(["admin@example.com"]);
const FORBIDDEN_PASSWORDS = new Set([
  "Admin123!",
  "ChangeMe123!",
  "DevAdmin123!",
  "DevBuyer123!",
  "Password123!",
  "admin",
  "changeme",
  "password"
]);

type ExistingUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  role: UserRole;
};

type DbCallArgs = Record<string, unknown>;

export type AdminBootstrapClient = {
  user: {
    findUnique(args: DbCallArgs): Promise<ExistingUser | null>;
    create(args: DbCallArgs): Promise<ExistingUser>;
    update(args: DbCallArgs): Promise<ExistingUser>;
  };
  bidderProfile: {
    upsert(args: DbCallArgs): Promise<unknown>;
  };
  $transaction<T>(callback: (transaction: AdminBootstrapClient) => Promise<T>): Promise<T>;
};

export type AdminCreateInput = {
  email: string;
  password: string;
  displayName?: string;
  promote?: boolean;
};

export type AdminCreateResult =
  | {
      status: "created";
      email: string;
      userId: string;
    }
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
  displayName?: string;
  promote: boolean;
  passwordStdin: boolean;
  dryRun: boolean;
  help: boolean;
};

export class AdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminBootstrapError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

function includesRequiredPasswordClasses(password: string) {
  return (
    /[a-z]/u.test(password) &&
    /[A-Z]/u.test(password) &&
    /\d/u.test(password) &&
    /[^A-Za-z0-9]/u.test(password)
  );
}

export function assertValidAdminBootstrapInput(input: AdminCreateInput) {
  const normalizedEmail = normalizeEmail(input.email);
  const password = input.password;

  if (!isValidEmail(normalizedEmail)) {
    throw new AdminBootstrapError("Provide a valid admin email address.");
  }

  if (LOCAL_FIXTURE_EMAILS.has(normalizedEmail) || normalizedEmail.endsWith(".local.layu.test")) {
    throw new AdminBootstrapError("Refusing to use documented local fixture credentials.");
  }

  if (RESERVED_PLACEHOLDER_EMAILS.has(normalizedEmail)) {
    throw new AdminBootstrapError("Refusing to use the placeholder seed admin email.");
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new AdminBootstrapError(
      `Admin password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`
    );
  }

  if (/\s/u.test(password)) {
    throw new AdminBootstrapError("Admin password must not contain whitespace.");
  }

  if (!includesRequiredPasswordClasses(password)) {
    throw new AdminBootstrapError(
      "Admin password must include lowercase, uppercase, number, and symbol characters."
    );
  }

  if (FORBIDDEN_PASSWORDS.has(password)) {
    throw new AdminBootstrapError("Refusing to use a default or local fixture password.");
  }

  const localPart = normalizedEmail.split("@")[0] ?? "";

  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    throw new AdminBootstrapError("Admin password must not contain the email local part.");
  }
}

export function assertDatabaseUrlConfigured(env: EnvShape = process.env) {
  if (!env.DATABASE_URL?.trim()) {
    throw new AdminBootstrapError("DATABASE_URL is required to create an admin account.");
  }
}

export async function createAdminAccount(
  client: AdminBootstrapClient,
  input: AdminCreateInput,
  options: {
    now?: Date;
    hashPasswordFn?: (password: string) => Promise<string>;
  } = {}
): Promise<AdminCreateResult> {
  assertValidAdminBootstrapInput(input);

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
      passwordHash: true,
      role: true
    }
  });

  if (existingUser?.role === UserRole.admin) {
    return {
      status: "already_admin",
      email: existingUser.email,
      userId: existingUser.id
    };
  }

  if (existingUser && !input.promote) {
    throw new AdminBootstrapError(
      "A non-admin user already exists for this email. Re-run with --promote to make that explicit."
    );
  }

  const passwordHash = await (options.hashPasswordFn ?? hashPassword)(input.password);
  const displayName = input.displayName?.trim() || "Administrator";

  return client.$transaction(async (transaction) => {
    if (existingUser) {
      const promotedUser = await transaction.user.update({
        where: {
          id: existingUser.id
        },
        data: {
          role: UserRole.admin,
          displayName,
          passwordHash,
          acceptedTermsVersion: DEFAULT_TERMS_VERSION,
          acceptedTermsAtUtc: now,
          emailVerifiedAtUtc: now
        },
        select: {
          id: true,
          email: true,
          normalizedEmail: true,
          passwordHash: true,
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
    }

    const createdUser = await transaction.user.create({
      data: {
        email: input.email.trim(),
        normalizedEmail,
        passwordHash,
        role: UserRole.admin,
        displayName,
        acceptedTermsVersion: DEFAULT_TERMS_VERSION,
        acceptedTermsAtUtc: now,
        emailVerifiedAtUtc: now,
        bidderProfile: {
          create: {
            maxBidTier: BidTier.full,
            activeHoldAmountCents: 0,
            isBlocked: false,
            nonPaymentStrikeCount: 0
          }
        }
      },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        role: true
      }
    });

    return {
      status: "created",
      email: createdUser.email,
      userId: createdUser.id
    };
  });
}

export function parseAdminCreateArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    promote: false,
    passwordStdin: false,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--promote") {
      options.promote = true;
      continue;
    }

    if (arg === "--password-stdin") {
      options.passwordStdin = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--email" || arg === "--display-name") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new AdminBootstrapError(`${arg} requires a value.`);
      }

      if (arg === "--email") {
        options.email = value;
      } else {
        options.displayName = value;
      }

      index += 1;
      continue;
    }

    throw new AdminBootstrapError(`Unknown option: ${arg}`);
  }

  return options;
}

function getUsage() {
  return [
    "Usage:",
    "  pnpm admin:create -- --email admin@yourdomain.com",
    "  pnpm admin:create -- --email admin@yourdomain.com --password-stdin",
    "",
    "Options:",
    "  --email <email>          Required admin email.",
    "  --display-name <name>    Optional display name.",
    "  --promote                Explicitly promote an existing non-admin user.",
    "  --password-stdin         Read the admin password from stdin.",
    "  --dry-run                Validate input without touching the database.",
    "  --help                   Show this help text.",
    "",
    "The password is never printed. Avoid passing passwords as command arguments."
  ].join("\n");
}

async function readPasswordFromStdin() {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/u)[0] ?? "";
}

async function promptForPassword() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new AdminBootstrapError(
      "Cannot prompt for a password in this shell. Re-run with --password-stdin."
    );
  }

  stdout.write("Admin password: ");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let password = "";

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };

    const onData = (data: Buffer) => {
      const value = data.toString("utf8");

      if (value === "\u0003") {
        cleanup();
        reject(new AdminBootstrapError("Password prompt cancelled."));
        return;
      }

      if (value === "\r" || value === "\n" || value === "\u0004") {
        cleanup();
        resolve(password);
        return;
      }

      if (value === "\u007f" || value === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += value;
    };

    stdin.on("data", onData);
  });
}

function isDirectExecution() {
  const scriptPath = process.argv[1];

  return Boolean(scriptPath && import.meta.url === pathToFileURL(scriptPath).href);
}

async function runCli() {
  const options = parseAdminCreateArgs(process.argv.slice(2));

  if (options.help) {
    console.log(getUsage());
    return;
  }

  if (!options.email) {
    throw new AdminBootstrapError("--email is required.");
  }

  const password = options.passwordStdin ? await readPasswordFromStdin() : await promptForPassword();
  const input: AdminCreateInput = {
    email: options.email,
    password,
    displayName: options.displayName,
    promote: options.promote
  };

  assertValidAdminBootstrapInput(input);

  if (options.dryRun) {
    console.log("Admin bootstrap dry run passed. No database changes were made.");
    return;
  }

  assertDatabaseUrlConfigured();

  const prisma = new PrismaClient() as unknown as AdminBootstrapClient & {
    $disconnect(): Promise<void>;
  };

  try {
    const result = await createAdminAccount(prisma, input);

    if (result.status === "already_admin") {
      console.log(`Admin account already exists for ${result.email}; no password was changed.`);
      return;
    }

    if (result.status === "promoted") {
      console.log(`Existing user promoted to admin: ${result.email}`);
      return;
    }

    console.log(`Admin account created: ${result.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (isDirectExecution()) {
  runCli().catch((error: unknown) => {
    if (error instanceof AdminBootstrapError) {
      console.error(error.message);
    } else {
      console.error("Admin bootstrap failed. Check DATABASE_URL and database connectivity.");
    }

    process.exitCode = 1;
  });
}
