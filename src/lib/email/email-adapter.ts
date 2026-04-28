export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  from?: string | null;
  replyTo?: string | null;
};

export type EmailReceipt = {
  messageId: string;
  deliveredAtUtc: string;
};

export interface EmailAdapter {
  send(message: EmailMessage): Promise<EmailReceipt>;
}
