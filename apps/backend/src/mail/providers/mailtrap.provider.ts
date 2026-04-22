import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppEnv } from '../../config/env.validation';
import type {
  EmailMessage,
  EmailProvider,
  EmailResult,
} from './email-provider.interface';

@Injectable()
export class MailtrapProvider implements EmailProvider, OnModuleDestroy {
  readonly name = 'mailtrap';
  private readonly logger = new Logger(MailtrapProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const transporter = this.getTransporter();
    try {
      const info = await transporter.sendMail({
        from: this.formatAddress(message.from),
        to: this.formatAddress(message.to),
        replyTo: message.replyTo
          ? this.formatAddress(message.replyTo)
          : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });

      return {
        providerId: info.messageId ?? null,
        acceptedAt: new Date(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Mailtrap send failed: ${msg} (to=${message.to.email})`);
      throw error;
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get('MAILTRAP_SMTP_HOST', { infer: true });
    const port = this.config.get('MAILTRAP_SMTP_PORT', { infer: true });
    const user = this.config.get('MAILTRAP_SMTP_USER', { infer: true });
    const pass = this.config.get('MAILTRAP_SMTP_PASS', { infer: true });

    if (!host || !user || !pass) {
      throw new Error('Mailtrap SMTP não configurado (host/user/pass)');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
    });

    return this.transporter;
  }

  private formatAddress(addr: { email: string; name?: string }): string {
    return addr.name ? `"${addr.name.replace(/"/g, '')}" <${addr.email}>` : addr.email;
  }
}
