import { describe, expect, it } from "vitest";

import {
  EdgeEnvError,
  parseEdgeAuthEnv
} from "../src/lib/config/edge-env.js";

describe("edge auth environment parsing", () => {
  it("uses development-safe auth defaults outside production", () => {
    const env = parseEdgeAuthEnv({
      NODE_ENV: "development"
    });

    expect(env.auth.secret).toBe("dev-only-secret-change-me");
    expect(env.auth.sessionCookieName).toBe("layu_session");
  });

  it("reads explicit auth settings", () => {
    const env = parseEdgeAuthEnv({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "12345678901234567890123456789012",
      AUTH_SESSION_COOKIE_NAME: "custom_session"
    });

    expect(env.auth.secret).toBe("12345678901234567890123456789012");
    expect(env.auth.sessionCookieName).toBe("custom_session");
  });

  it("rejects missing or placeholder production secrets", () => {
    expect(() =>
      parseEdgeAuthEnv({
        NODE_ENV: "production"
      })
    ).toThrow(EdgeEnvError);

    expect(() =>
      parseEdgeAuthEnv({
        NODE_ENV: "production",
        NEXTAUTH_SECRET: "replace-with-a-real-secret"
      })
    ).toThrow(/NEXTAUTH_SECRET/);
  });
});
