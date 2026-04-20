import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/lib/auth/password.js";

describe("password hashing", () => {
  it("hashes and verifies a valid password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
