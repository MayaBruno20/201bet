import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  EmailProvider,
  EmailResult,
} from './email-provider.interface';

@Injectable()
export class NoopProvider implements EmailProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopProvider.name);

  async send(message: EmailMessage): Promise<EmailResult> {
    this.logger.log(
      `[noop] would send to=${message.to.email} subject="${message.subject}" tags=${(message.tags ?? []).join(',')}`,
    );
    return {
      providerId: `noop-${Date.now()}`,
      acceptedAt: new Date(),
    };
  }
}
