import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import type { AppEnv } from '../config/env.validation';
import { EMAIL_JOBS, QUEUE_NAMES } from '../queue/queue.constants';
import { DailyRateLimiter } from './daily-rate-limiter';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  type EmailMessage,
} from './providers/email-provider.interface';
import { TemplateRenderer } from './template-renderer';
import type {
  AnyEmailJobData,
  PasswordChangedJobData,
  PasswordResetJobData,
  VerificationJobData,
} from './mail.types';

@Processor(QUEUE_NAMES.EMAIL, { skipWaitingForReady: true })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly queue: Queue,
    private readonly renderer: TemplateRenderer,
    private readonly rateLimiter: DailyRateLimiter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    super();
  }

  async process(job: Job<AnyEmailJobData>): Promise<void> {
    const decision = await this.rateLimiter.consume();
    if (!decision.allowed) {
      const delayMs = Math.max(
        60_000,
        decision.retryAtUtc.getTime() - Date.now(),
      );
      await this.queue.add(job.name, job.data, {
        delay: delayMs,
        priority: job.opts.priority,
      });
      this.logger.warn(
        `Rate limit ${decision.current}/${decision.limit} — rescheduled ${job.name} to ${decision.retryAtUtc.toISOString()}`,
      );
      return;
    }

    const message = this.buildMessage(job);

    try {
      const result = await this.provider.send(message);
      this.logger.log(
        `Sent ${job.name} to=${message.to.email} provider=${this.provider.name} id=${result.providerId ?? 'n/a'} daily=${decision.current}/${decision.limit}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed ${job.name} to=${message.to.email} provider=${this.provider.name}: ${msg}`,
      );
      throw error;
    }
  }

  private buildMessage(job: Job<AnyEmailJobData>): EmailMessage {
    const from = {
      email: this.config.get('EMAIL_FROM_ADDRESS', { infer: true }),
      name: this.config.get('EMAIL_FROM_NAME', { infer: true }),
    };
    const replyToEmail = this.config.get('EMAIL_REPLY_TO', { infer: true });
    const replyTo = replyToEmail ? { email: replyToEmail } : undefined;
    const supportEmail = replyToEmail ?? from.email;
    const manageEmailPrefsUrl = this.buildManageUrl();
    const logoUrl = this.buildLogoUrl();
    const year = new Date().getUTCFullYear();

    switch (job.name) {
      case EMAIL_JOBS.VERIFICATION: {
        const data = job.data as VerificationJobData;
        const rendered = this.renderer.render('verification', {
          userName: data.userName,
          verificationUrl: data.verificationUrl,
          expiresInHours: data.expiresInHours,
          supportEmail,
          manageEmailPrefsUrl,
          logoUrl,
          year,
        });
        return {
          to: { email: data.email, name: data.userName || undefined },
          from,
          replyTo,
          subject: 'Confirme seu e-mail no 201bet',
          html: rendered.html,
          text: rendered.text,
          tags: ['verification'],
        };
      }

      case EMAIL_JOBS.PASSWORD_RESET: {
        const data = job.data as PasswordResetJobData;
        const rendered = this.renderer.render('password-reset', {
          userName: data.userName,
          resetUrl: data.resetUrl,
          expiresInMinutes: data.expiresInMinutes,
          supportEmail,
          manageEmailPrefsUrl,
          logoUrl,
          year,
        });
        return {
          to: { email: data.email, name: data.userName || undefined },
          from,
          replyTo,
          subject: 'Redefinição de senha - 201bet',
          html: rendered.html,
          text: rendered.text,
          tags: ['password-reset'],
        };
      }

      case EMAIL_JOBS.PASSWORD_CHANGED: {
        const data = job.data as PasswordChangedJobData;
        const rendered = this.renderer.render('password-changed', {
          userName: data.userName,
          changedAt: this.formatDateTime(data.changedAtIso),
          ipAddress: data.ipAddress,
          supportEmail,
          manageEmailPrefsUrl,
          logoUrl,
          year,
        });
        return {
          to: { email: data.email, name: data.userName || undefined },
          from,
          replyTo,
          subject: 'Sua senha do 201bet foi alterada',
          html: rendered.html,
          text: rendered.text,
          tags: ['password-changed'],
        };
      }

      default:
        throw new Error(`Unknown email job: ${job.name}`);
    }
  }

  private buildManageUrl(): string {
    const base = this.config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/$/, '');
    return `${base}/preferencias-de-email`;
  }

  private buildLogoUrl(): string {
    const override = this.config.get('EMAIL_LOGO_URL', { infer: true });
    if (override && override.trim().length > 0) {
      return override.trim();
    }
    const base = this.config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/$/, '');
    return `${base}/images/logo.png`;
  }

  private formatDateTime(iso: string): string {
    try {
      const dt = new Date(iso);
      return dt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return iso;
    }
  }
}
