import { BidTier, UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  AdminPromotionError,
  type AdminPromotionClient,
  promoteExistingUserToAdmin,
  runAdminPromoteCli
} from "../scripts/promote-admin.js";

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
  let client: AdminPromotionClient;

  client = {
    user: {
      findUnique: vi.fn(async (args: CallArgs) => {
        if (!user || args.where?.normalizedEmail !== user.normalizedEmail) {
          return null;
        }

        return user;
      }),
      update: vi.fn(async (args: CallArgs) => {
        if (!user) {
          throw new Error("Expected existing user.");
        }

        user = {
          ...user,
          role: args.data?.role as UserRole
        };

        return user;
      })
    },
    bidderProfile: {
      upsert: vi.fn(async () => ({}))
    },
    $transaction: async <T>(callback: (transaction: AdminPromotionClient) => Promise<T>) =>
      callback(client)
  };

  return {
    client,
    getUser: () => user
  };
}

const cliEnv = {
  DATABASE_URL: "postgresql://auction:secret@example.com/auction"
};

describe("admin promotion", () => {
  it("promotes an existing non-admin user", async () => {
    const { client } = createFakeClient({
      id: "bidder-id",
      email: "Owner@Example.org",
      normalizedEmail: "owner@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    const result = await promoteExistingUserToAdmin(client, {
      email: " OWNER@example.ORG "
    });

    expect(result).toEqual({
      status: "promoted",
      email: "Owner@Example.org",
      userId: "bidder-id"
    });
    expect(client.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          normalizedEmail: "owner@example.org"
        }
      })
    );
    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "bidder-id"
        },
        data: {
          role: UserRole.admin
        }
      })
    );
    expect(client.bidderProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "bidder-id"
        },
        update: expect.objectContaining({
          maxBidTier: BidTier.full,
          activeHoldAmountCents: 0,
          isBlocked: false
        }),
        create: expect.objectContaining({
          userId: "bidder-id",
          maxBidTier: BidTier.full
        })
      })
    );
  });

  it("fails clearly if the user does not exist", async () => {
    const { client } = createFakeClient();

    await expect(
      promoteExistingUserToAdmin(client, {
        email: "missing@example.org"
      })
    ).rejects.toBeInstanceOf(AdminPromotionError);

    await expect(
      promoteExistingUserToAdmin(client, {
        email: "missing@example.org"
      })
    ).rejects.toThrow(/No existing user found/u);
    expect(client.user.update).not.toHaveBeenCalled();
    expect(client.bidderProfile.upsert).not.toHaveBeenCalled();
  });

  it("exits successfully when the user is already admin", async () => {
    const { client } = createFakeClient({
      id: "admin-id",
      email: "admin@example.org",
      normalizedEmail: "admin@example.org",
      passwordHash: "existing-admin-hash",
      role: UserRole.admin
    });
    const messages: string[] = [];

    const result = await runAdminPromoteCli(
      ["--email", "ADMIN@example.org", "--confirm-production-promotion"],
      {
        client,
        env: cliEnv,
        stdout: (message) => messages.push(message)
      }
    );

    expect(result).toEqual({
      status: "already_admin",
      email: "admin@example.org",
      userId: "admin-id"
    });
    expect(messages).toEqual([
      "Admin already exists for admin@example.org; no changes were made."
    ]);
    expect(client.user.update).not.toHaveBeenCalled();
    expect(client.bidderProfile.upsert).not.toHaveBeenCalled();
  });

  it("does not change the password hash", async () => {
    const { client, getUser } = createFakeClient({
      id: "bidder-id",
      email: "bidder@example.org",
      normalizedEmail: "bidder@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    await promoteExistingUserToAdmin(client, {
      email: "bidder@example.org"
    });

    const updateCall = vi.mocked(client.user.update).mock.calls[0]?.[0] as CallArgs;

    expect(updateCall.data).not.toHaveProperty("passwordHash");
    expect(getUser()?.passwordHash).toBe("existing-hash");
  });

  it("refuses to run without the confirmation flag", async () => {
    const { client } = createFakeClient({
      id: "bidder-id",
      email: "bidder@example.org",
      normalizedEmail: "bidder@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    await expect(
      runAdminPromoteCli(["--email", "bidder@example.org"], {
        client,
        env: cliEnv,
        stdout: () => undefined
      })
    ).rejects.toThrow(/--confirm-production-promotion/u);
    expect(client.user.findUnique).not.toHaveBeenCalled();
    expect(client.user.update).not.toHaveBeenCalled();
  });

  it("requires the production environment gate in production", async () => {
    const { client } = createFakeClient({
      id: "bidder-id",
      email: "bidder@example.org",
      normalizedEmail: "bidder@example.org",
      passwordHash: "existing-hash",
      role: UserRole.bidder
    });

    await expect(
      runAdminPromoteCli(
        ["--email", "bidder@example.org", "--confirm-production-promotion"],
        {
          client,
          env: {
            ...cliEnv,
            NODE_ENV: "production"
          },
          stdout: () => undefined
        }
      )
    ).rejects.toThrow(/ALLOW_ADMIN_PROMOTE=1/u);
    expect(client.user.findUnique).not.toHaveBeenCalled();
    expect(client.user.update).not.toHaveBeenCalled();
  });
});
