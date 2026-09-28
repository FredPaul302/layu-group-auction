import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  socialAccount: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  socialLoginAttempt: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  getEnabledSocialProviders: vi.fn(() => ["google", "facebook"])
}));
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks, $transaction: (callback: (tx: typeof mocks) => unknown) => callback(mocks) } }));
vi.mock("@/lib/auth", () => ({ authUserSelect: { id: true, role: true, email: true, emailVerifiedAtUtc: true }, isValidEmail: (email: string) => /^[^@]+@[^@]+\.[^@]+$/u.test(email), normalizeEmail: (email: string) => email.toLowerCase().trim() }));
vi.mock("@/lib/auth/config", () => ({ getCurrentTermsVersion: () => "terms-v1" }));
vi.mock("@/lib/auth/social-config", async (importOriginal) => ({ ...await importOriginal<typeof import("../src/lib/auth/social-config")>(), getEnabledSocialProviders: mocks.getEnabledSocialProviders }));

import { consumeSocialAttempt, createSocialAttempt, disconnectSocialAccount, resolveSocialIdentity } from "../src/lib/auth/social-service";
import { hashOpaqueToken } from "../src/lib/auth/tokens";
import type { AuthenticatedUser } from "../src/lib/auth";

const user = { id: "existing-user", email: "person@example.com", role: "bidder", emailVerifiedAtUtc: new Date(), displayName: null, acceptedTermsAtUtc: new Date(), acceptedTermsVersion: "terms-v1", bidderProfile: null } satisfies AuthenticatedUser;
const identity = { provider: "google" as const, providerAccountId: "google-user", email: "person@example.com", emailVerified: true, displayName: "Person" };
const input = { identity, intent: "register", linkedUserId: null, currentUser: null, termsVersion: "terms-v1" };

describe("social account identity and registration rules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.socialAccount.findUnique.mockResolvedValue(null);
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.create.mockResolvedValue(user);
    mocks.socialLoginAttempt.deleteMany.mockResolvedValue({ count: 1 });
  });
  it("does not silently link a matching verified email", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "existing-user" });
    await expect(resolveSocialIdentity(input)).rejects.toThrow("social_email_exists");
    expect(mocks.user.create).not.toHaveBeenCalled();
    expect(mocks.socialAccount.create).not.toHaveBeenCalled();
  });
  it("requires registration consent for a new social identity", async () => {
    await expect(resolveSocialIdentity({ ...input, intent: "signin" })).rejects.toThrow("social_registration_required");
    await expect(resolveSocialIdentity({ ...input, termsVersion: null })).rejects.toThrow("terms_required");
    expect(mocks.user.create).not.toHaveBeenCalled();
  });
  it("creates a bidder with accepted terms and a provider-specific identity", async () => {
    await resolveSocialIdentity(input);
    expect(mocks.user.create.mock.calls[0][0].data).toMatchObject({ role: "bidder", acceptedTermsVersion: "terms-v1", emailVerifiedAtUtc: expect.any(Date), socialAccounts: { create: { provider: "google", providerAccountId: "google-user" } } });
    expect(mocks.user.create.mock.calls[0][0].data.passwordHash).toBeUndefined();
  });
  it("preserves unverified email for new Facebook registrations", async () => {
    await resolveSocialIdentity({ ...input, identity: { ...identity, provider: "facebook", emailVerified: false } });
    expect(mocks.user.create.mock.calls[0][0].data.emailVerifiedAtUtc).toBeNull();
  });
  it("cannot register without a usable shared email", async () => {
    await expect(resolveSocialIdentity({ ...input, identity: { ...identity, email: null } })).rejects.toThrow("social_email_required");
  });
  it("signs in by stable provider identity even if provider email changed", async () => {
    mocks.socialAccount.findUnique.mockResolvedValue({ user });
    expect(await resolveSocialIdentity({ ...input, identity: { ...identity, email: "changed@example.com" }, intent: "signin" })).toEqual({ user, created: false });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });
  it("permits explicit linking only to the same verified signed-in account", async () => {
    await expect(resolveSocialIdentity({ ...input, intent: "link", linkedUserId: "another-user", currentUser: user })).rejects.toThrow("social_verify_first");
    await expect(resolveSocialIdentity({ ...input, intent: "link", linkedUserId: user.id, currentUser: { ...user, emailVerifiedAtUtc: null } })).rejects.toThrow("social_verify_first");
    await resolveSocialIdentity({ ...input, intent: "link", linkedUserId: user.id, currentUser: user });
    expect(mocks.socialAccount.create).toHaveBeenCalledWith({ data: { userId: user.id, provider: "google", providerAccountId: "google-user" } });
  });
  it("does not move an existing social identity to a different account", async () => {
    mocks.socialAccount.findUnique.mockResolvedValue({ user: { ...user, id: "someone-else" } });
    await expect(resolveSocialIdentity({ ...input, intent: "link", linkedUserId: user.id, currentUser: user })).rejects.toThrow("social_already_connected");
    expect(mocks.socialAccount.create).not.toHaveBeenCalled();
  });
});

describe("disconnecting social sign-in", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getEnabledSocialProviders.mockReturnValue(["google", "facebook"]); });
  it("does not remove the only sign-in method", async () => {
    mocks.user.findUnique.mockResolvedValue({ passwordHash: null, socialAccounts: [{ provider: "facebook" }] });
    await expect(disconnectSocialAccount("user", "facebook")).rejects.toThrow("social_last_method");
    expect(mocks.socialAccount.deleteMany).not.toHaveBeenCalled();
  });
  it("does not count a disabled provider as another usable method", async () => {
    mocks.getEnabledSocialProviders.mockReturnValue(["facebook"]);
    mocks.user.findUnique.mockResolvedValue({ passwordHash: null, socialAccounts: [{ provider: "facebook" }, { provider: "google" }] });
    await expect(disconnectSocialAccount("user", "facebook")).rejects.toThrow("social_last_method");
    expect(mocks.socialAccount.deleteMany).not.toHaveBeenCalled();
  });
  it("removes only the specified identity and pending linking attempts when a password remains", async () => {
    mocks.user.findUnique.mockResolvedValue({ passwordHash: "hashed-password", socialAccounts: [{ provider: "facebook" }] });
    await disconnectSocialAccount("user", "facebook");
    expect(mocks.socialAccount.deleteMany).toHaveBeenCalledWith({ where: { userId: "user", provider: "facebook" } });
    expect(mocks.socialLoginAttempt.deleteMany).toHaveBeenCalledWith({ where: { userId: "user", provider: "facebook", intent: "link" } });
  });
  it("allows removal when another enabled linked provider remains", async () => {
    mocks.user.findUnique.mockResolvedValue({ passwordHash: null, socialAccounts: [{ provider: "facebook" }, { provider: "google" }] });
    await disconnectSocialAccount("user", "facebook");
    expect(mocks.socialAccount.deleteMany).toHaveBeenCalledOnce();
  });
});

describe("social login attempt browser binding and replay prevention", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.socialLoginAttempt.deleteMany.mockResolvedValue({ count: 1 }); });
  it("stores only hashed browser/state tokens and expires in ten minutes", async () => {
    const attempt = await createSocialAttempt({ provider: "google", intent: "signin", currentUser: null, termsAccepted: false, nextPath: "//evil.example" });
    const saved = mocks.socialLoginAttempt.create.mock.calls[0][0].data;
    expect(saved.stateHash).toBe(hashOpaqueToken(attempt.state));
    expect(saved.browserTokenHash).toBe(hashOpaqueToken(attempt.browserToken));
    expect(saved.stateHash).not.toBe(attempt.state);
    expect(saved.nextPath).toBe("/account");
    expect(attempt.expiresAtUtc.getTime() - Date.now()).toBeLessThanOrEqual(600_000);
  });
  it("requires the same browser token and provider before consuming the attempt", async () => {
    const state = "a".repeat(43), browser = "b".repeat(43);
    mocks.socialLoginAttempt.findUnique.mockResolvedValue({ stateHash: hashOpaqueToken(state), browserTokenHash: hashOpaqueToken(browser), provider: "google", expiresAtUtc: new Date(Date.now() + 600_000) });
    await expect(consumeSocialAttempt("google", state, "c".repeat(43))).rejects.toThrow("social_expired");
    await expect(consumeSocialAttempt("facebook", state, browser)).rejects.toThrow("social_expired");
    expect(mocks.socialLoginAttempt.deleteMany).not.toHaveBeenCalled();
    await expect(consumeSocialAttempt("google", state, browser)).resolves.toMatchObject({ provider: "google" });
  });
  it("rejects expired and concurrently consumed attempts", async () => {
    const state = "a".repeat(43), browser = "b".repeat(43);
    const record = { stateHash: hashOpaqueToken(state), browserTokenHash: hashOpaqueToken(browser), provider: "google", expiresAtUtc: new Date(Date.now() - 1) };
    mocks.socialLoginAttempt.findUnique.mockResolvedValue(record);
    await expect(consumeSocialAttempt("google", state, browser)).rejects.toThrow("social_expired");
    mocks.socialLoginAttempt.findUnique.mockResolvedValue({ ...record, expiresAtUtc: new Date(Date.now() + 600_000) });
    mocks.socialLoginAttempt.deleteMany.mockResolvedValue({ count: 0 });
    await expect(consumeSocialAttempt("google", state, browser)).rejects.toThrow("social_expired");
  });
});
