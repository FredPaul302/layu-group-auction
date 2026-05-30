export type { EmailAdapter, EmailMessage, EmailReceipt } from "./email-adapter";
export { ConsoleEmailAdapter } from "./console-email-adapter";
export { SesEmailAdapter } from "./ses-email-adapter";
export { WebhookEmailAdapter } from "./webhook-email-adapter";
export { getEmailAdapter, resetEmailAdapterForTests, sendEmail } from "./server";
