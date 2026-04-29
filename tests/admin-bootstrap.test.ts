import { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  AdminBootstrapError,
  type AdminBootstrapClient,
  assertDatabaseUrlConfigured,
  assertValidAdminBootstrapInput,
  createAdminAccount,
  parseAdminCreateArgs
} from "../scripts/create-admin.js";
import {
  assertLocalSeedAllowed,
  createLocalSeedEnvironment
} from "../scripts/seed-local.js";

type UserRecord = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  role: UserRole;
};

type CallArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

function createFakeClient(existingUser: UserRecord | null = null) {
  let user = existingUser;
  let client: AdminBootstrapClient;

  client = {
    user: {
      findUnique: vi.fn(async () => user),
      create: vi.fn(async (args: CallArgs) => {
        user = {
          id: "created-user-id",
          email: String(args.data?.email),
          normalizedEmail: String(args.data?.normalizedEmail),
          passwordHash: String(args.data?.passwordHash),
          role: args.data?.role as UserRole
        };

        return user;
      }),
      update: vi.fn(async (args: CallArgs) => {
        if (!user) {
          throw new Error("Expected existing user.");
        }

        user = {
          ...user,
          passwordHash: String(args.data?.passwordHash),
          role: args.data?.role as UserRole
        };

        return user;
      })
    },
    bidderProfile: {
      upsert: vi.fn(async () => ({}))
    },
    $transaction: async <T>(callback: (transaction: AdminBootstrapClient) => Promise<T>) =>
      callback(client)
  };

  return client;
}

describe("admin bootstrap input validation", () => {
  it("rejects documented fixture credentials", () => {
    expect(() =>
      assertValidAdminBootstrapInput({
        email: "admin@local.layu.test",
        password: "Strong-Admin-123!"
      })
    ).toThrow(/fixture credentials/u);

    expect(() =>
      assertValidAdminBootstrapInput({
        email: "operator@example.org",
        password: "DevAdmin123!"
      })
    ).toThrow(/fixture password/u);
  });

  it("rejects weak and placeholder admin inputs", () => {
    expect(() =>
      assertValidAdminBootstrapInput({
        email: "admin@example.com",
        password: "Strong-Admin-123!"
      })
    ).toThrow(/placeholder/u);

    expect(() =>
      assertValidAdminBootstrapInput({
        email: "operator@example.org",
        password: "short"
      })
    ).toThrow(/at least/u);
  });

  it("requires DATABASE_URL before live admin creation", () => {
    expect(() => assertDatabaseUrlConfigured({})).toThrow(/DATABASE_URL/u);
  });
});

describe("admin account creation", () => {
  it("creates an explicit admin user with a profile", async () => {
    const client = createFakeClient();
    const result = await createAdminAccount(
      client,
      {
        email: "Owner@Example.org",
        password: "Strong-Admin-123!"
      },
      {
        hashPasswordFn: async () => "hashed-password",
        now: new Date("2026-04-28T00:00:00.000Z")
      }
    );

    expect(result).toEqual({
      status: "created",
      email: "Owner@Example.org",
      userId: "created-user-id"
    });
    expect(client.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          normalizedEmail: "owner@example.org",
          passwordHash: "hashed-password",
          role: UserRole.admin,
          bidderProfile: {
            create: expect.objectContaining({
              maxBidTier: "full"
            })
          }
        })
      })
    );
  });

  it("does not change an existing admin password by default", async () => {
    const client = createFakeClient({
      id: "admin-id",
      email: "admin@example.org",
      normalizedEmail: "admin@example.org",
      passwordHash: "existing-hash",
      role: UserRole.admin
    });

    const result = await createAdminAccount(
      client,
      {
        email: "admin@example.org",
        password: "Strong-Root-123!"
      },
      {
        hashPasswordFn: async () => "new-hash"
      }
    );

    expect(result).toEqual({
      status: "already_admin",
      email: "admin@example.org",
      userId: "admin-id"
    });
    expect(client.user.update).not.toHaveBeenCalled();
    expect(client.bidderProfile.upsert).not.toHaveBeenCalled();
  });

  it("requires explicit promote for existing non-admin users", async () => {
    const client = createFakeClient({
      id: "bidder-id",
      email: "bidder@example.org",
      normalizedEmail: "bidder@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    await expect(
      createAdminAccount(client, {
        email: "bidder@example.org",
        password: "Strong-Admin-123!"
      })
    ).rejects.toBeInstanceOf(AdminBootstrapError);

    expect(client.user.update).not.toHaveBeenCalled();
  });

  it("promotes an existing user only when requested", async () => {
    const client = createFakeClient({
      id: "bidder-id",
      email: "bidder@example.org",
      normalizedEmail: "bidder@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    const result = await createAdminAccount(
      client,
      {
        email: "bidder@example.org",
        password: "Strong-Admin-123!",
        promote: true
      },
      {
        hashPasswordFn: async () => "promoted-hash"
      }
    );

    expect(result).toEqual({
      status: "promoted",
      email: "bidder@example.org",
      userId: "bidder-id"
    });
    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "promoted-hash",
          role: UserRole.admin
        })
      })
    );
    expect(client.bidderProfile.upsert).toHaveBeenCalled();
  });
});

describe("admin bootstrap CLI parsing", () => {
  it("parses safe operator options without accepting password arguments", () => {
    expect(
      parseAdminCreateArgs([
        "--email",
        "owner@example.org",
        "--display-name",
        "Owner",
        "--promote",
        "--password-stdin"
      ])
    ).toEqual({
      email: "owner@example.org",
      displayName: "Owner",
      promote: true,
      passwordStdin: true,
      dryRun: false,
      help: false
    });

    expect(() => parseAdminCreateArgs(["--password", "secret"])).toThrow(/Unknown/u);
  });
});

describe("local fixture seed wrapper", () => {
  it("enables local fixture seed in a shell-independent way", () => {
    expect(createLocalSeedEnvironment({ NODE_ENV: "development" }).SEED_LOCAL_DEV_DATA).toBe(
      "true"
    );
  });

  it("keeps the production refusal behavior", () => {
    expect(() => assertLocalSeedAllowed({ NODE_ENV: "production" })).toThrow(/production/u);
  });
});
