import {
  AppEnvError,
  getAppEnv,
  requireSesEmailConfig,
  requireWebhookEmailConfig
} from "@/lib/config/app-env";
import { logStructuredEvent, serializeError } from "@/lib/ops/structured-logging";

import { ConsoleEmailAdapter } from "./console-email-adapter";
import type { EmailAdapter, EmailMessage } from "./email-adapter";
import { SesEmailAdapter } from "./ses-email-adapter";
import { WebhookEmailAdapter } from "./webhook-email-adapter";

let cachedEmailAdapter: EmailAdapter | null = null;

export function getEmailAdapter() {
  cachedEmailAdapter ??= createEmailAdapter();

  return cachedEmailAdapter;
}

export function resetEmailAdapterForTests() {
  cachedEmailAdapter = null;
}

function createEmailAdapter() {
  const env = getAppEnv();

  if (env.email.driver === "webhook") {
    const config = requireWebhookEmailConfig();

    return new WebhookEmailAdapter(config);
  }

  if (env.email.driver === "ses") {
    const config = requireSesEmailConfig();

    return new SesEmailAdapter(config);
  }

  if (env.runtime.isProduction) {
    throw new AppEnvError(
      "EMAIL_DRIVER=console is intended for local or non-production environments. Configure EMAIL_DRIVER=ses or EMAIL_DRIVER=webhook before production deployment.",
      "EMAIL_DRIVER"
    );
  }

  return new ConsoleEmailAdapter();
}

export async function sendEmail(message: EmailMessage) {
  try {
    return await getEmailAdapter().send(message);
  } catch (error) {
    logStructuredEvent("error", "email_send_failed", {
      driver: getAppEnv().email.driver,
      to: message.to,
      subject: message.subject,
      error: serializeError(error)
    });
    throw error;
  }
}
