export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
  headers?: Record<string, string>;
}

export interface EmailResult {
  providerId: string | null;
  acceptedAt: Date;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
