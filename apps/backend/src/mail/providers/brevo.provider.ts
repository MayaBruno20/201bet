import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env.validation';
import type {
  EmailMessage,
  EmailProvider,
  EmailResult,
} from './email-provider.interface';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoResponse {
  messageId?: string;
  messageIds?: string[];
}

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

@Injectable()
export class BrevoProvider implements EmailProvider {
  readonly name = 'brevo';
  private readonly logger = new Logger(BrevoProvider.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const apiKey = this.config.get('BREVO_API_KEY', { infer: true });
    if (!apiKey) {
      throw new Error('BREVO_API_KEY não configurado');
    }

    const body = {
      sender: { email: message.from.email, name: message.from.name },
      to: [{ email: message.to.email, name: message.to.name }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.tags?.length ? { tags: message.tags } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await this.safeParseError(response);
      const detail =
        errorBody?.message ?? errorBody?.code ?? response.statusText;
      this.logger.error(
        `Brevo send failed: ${response.status} ${detail} (to=${message.to.email})`,
      );
      throw new Error(
        `Brevo send failed: ${response.status} ${detail}`,
      );
    }

    const data = (await response.json()) as BrevoResponse;
    const messageId = data.messageId ?? data.messageIds?.[0] ?? null;

    return {
      providerId: messageId,
      acceptedAt: new Date(),
    };
  }

  private async safeParseError(
    response: Response,
  ): Promise<BrevoErrorBody | null> {
    try {
      return (await response.json()) as BrevoErrorBody;
    } catch {
      return null;
    }
  }
}
