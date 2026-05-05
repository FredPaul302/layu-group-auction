import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextServerResponse } from "next/server";

import {
  consumeRateLimits,
  getClientIp,
  normalizeRateLimitEmail,
  type RateLimitPolicy,
  type RateLimitResult
} from "@/lib/rate-limit";

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;

export const publicAuthRateLimitRules = {
  forgotPasswordEmail: {
    limit: 3,
    windowMs: hourMs
  },
  forgotPasswordIp: {
    limit: 10,
    windowMs: hourMs
  },
  loginEmail: {
    limit: 8,
    windowMs: 10 * minuteMs
  },
  loginIp: {
    limit: 30,
    windowMs: 10 * minuteMs
  },
  identityWebhookIp: {
    limit: 60,
    windowMs: minuteMs
  },
  personaWebhookIp: {
    limit: 60,
    windowMs: minuteMs
  },
  registerEmail: {
    limit: 3,
    windowMs: hourMs
  },
  registerIp: {
    limit: 20,
    windowMs: hourMs
  },
  resetPasswordIp: {
    limit: 30,
    windowMs: 15 * minuteMs
  },
  resetPasswordToken: {
    limit: 5,
    windowMs: 15 * minuteMs
  },
  verifyEmailIp: {
    limit: 30,
    windowMs: 15 * minuteMs
  },
  verifyEmailResendIp: {
    limit: 10,
    windowMs: hourMs
  },
  verifyEmailResendUser: {
    limit: 3,
    windowMs: hourMs
  },
  verifyEmailToken: {
    limit: 5,
    windowMs: 15 * minuteMs
  }
} as const;

function policy(
  bucket: string,
  identifiers: string[],
  rule: {
    limit: number;
    windowMs: number;
  }
): RateLimitPolicy {
  return {
    bucket,
    identifiers,
    limit: rule.limit,
    windowMs: rule.windowMs
  };
}

function ipIdentifier(request: NextRequest) {
  return getClientIp(request.headers);
}

function emailIdentifier(email: string) {
  return normalizeRateLimitEmail(email);
}

export function withRateLimitHeaders<T extends NextResponse>(
  response: T,
  result: RateLimitResult
) {
  response.headers.set("Retry-After", String(result.retryAfterSeconds));

  return response;
}

export function rateLimitJsonResponse(result: RateLimitResult) {
  return NextServerResponse.json(
    {
      status: "too_many_attempts"
    },
    {
      headers: {
        "Retry-After": String(result.retryAfterSeconds)
      },
      status: 429
    }
  );
}

export async function rateLimitLogin(request: NextRequest, email: string) {
  return consumeRateLimits([
    policy("auth:login:ip", [ipIdentifier(request)], publicAuthRateLimitRules.loginIp),
    policy("auth:login:email", [emailIdentifier(email)], publicAuthRateLimitRules.loginEmail)
  ]);
}

export async function rateLimitRegister(request: NextRequest, email: string) {
  return consumeRateLimits([
    policy("auth:register:ip", [ipIdentifier(request)], publicAuthRateLimitRules.registerIp),
    policy(
      "auth:register:email",
      [emailIdentifier(email)],
      publicAuthRateLimitRules.registerEmail
    )
  ]);
}

export async function rateLimitForgotPassword(request: NextRequest, email: string) {
  return consumeRateLimits([
    policy(
      "auth:forgot-password:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.forgotPasswordIp
    ),
    policy(
      "auth:forgot-password:email",
      [emailIdentifier(email)],
      publicAuthRateLimitRules.forgotPasswordEmail
    )
  ]);
}

export async function rateLimitPasswordReset(request: NextRequest, token: string) {
  return consumeRateLimits([
    policy(
      "auth:reset-password:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.resetPasswordIp
    ),
    policy(
      "auth:reset-password:token",
      [token.trim()],
      publicAuthRateLimitRules.resetPasswordToken
    )
  ]);
}

export async function rateLimitEmailVerificationToken(request: NextRequest, token: string) {
  return consumeRateLimits([
    policy(
      "auth:verify-email:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.verifyEmailIp
    ),
    policy(
      "auth:verify-email:token",
      [token.trim()],
      publicAuthRateLimitRules.verifyEmailToken
    )
  ]);
}

export async function rateLimitEmailVerificationResend(
  request: NextRequest,
  user: {
    email: string;
    id: string;
  }
) {
  return consumeRateLimits([
    policy(
      "auth:verify-email-resend:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.verifyEmailResendIp
    ),
    policy(
      "auth:verify-email-resend:user",
      [user.id, emailIdentifier(user.email)],
      publicAuthRateLimitRules.verifyEmailResendUser
    )
  ]);
}

export async function rateLimitIdentityWebhook(request: NextRequest) {
  return consumeRateLimits([
    policy(
      "identity:webhook:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.identityWebhookIp
    )
  ]);
}

export async function rateLimitPersonaWebhook(request: NextRequest) {
  return consumeRateLimits([
    policy(
      "persona:webhook:ip",
      [ipIdentifier(request)],
      publicAuthRateLimitRules.personaWebhookIp
    )
  ]);
}
