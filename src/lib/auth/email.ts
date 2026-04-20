import { getAppEnv } from "@/lib/config/app-env";
import { ConsoleNotificationAdapter } from "@/lib/notifications";

const notificationAdapter = new ConsoleNotificationAdapter();

export async function sendEmailVerificationMessage(input: {
  email: string;
  token: string;
}) {
  const verificationUrl = new URL("/api/auth/verify-email", getAppEnv().appUrl);
  verificationUrl.searchParams.set("token", input.token);

  return notificationAdapter.send({
    channel: "email",
    to: input.email,
    subject: "Verify your email",
    body: [
      "Welcome to Layu Group LLC Auction.",
      "",
      "Verify your email to continue toward bidding eligibility:",
      verificationUrl.toString()
    ].join("\n")
  });
}

export async function sendPasswordResetMessage(input: {
  email: string;
  token: string;
}) {
  const resetUrl = new URL("/auth/reset-password", getAppEnv().appUrl);
  resetUrl.searchParams.set("token", input.token);

  return notificationAdapter.send({
    channel: "email",
    to: input.email,
    subject: "Reset your password",
    body: [
      "A password reset was requested for your Layu Group LLC Auction account.",
      "",
      "Use this link to choose a new password:",
      resetUrl.toString()
    ].join("\n")
  });
}
