import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppEnv } from '../config/env.validation';
import { EMAIL_JOBS, EMAIL_JOB_PRIORITY, QUEUE_NAMES } from '../queue/queue.constants';
import type {
  PasswordChangedJobData,
  PasswordResetJobData,
  SendPasswordChangedArgs,
  SendPasswordResetArgs,
  SendVerificationArgs,
  VerificationJobData,
} from './mail.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async sendVerification(args: SendVerificationArgs): Promise<void> {
    const expiresInHours = this.config.get('EMAIL_VERIFICATION_TTL_HOURS', {
      infer: true,
    });

    const data: VerificationJobData = {
      userId: args.userId,
      email: args.email,
      userName: this.firstName(args.userName),
      verificationUrl: this.buildUrl('/verify-email', args.rawToken),
      expiresInHours,
    };

    await this.enqueue(EMAIL_JOBS.VERIFICATION, data);
  }

  async sendPasswordReset(args: SendPasswordResetArgs): Promise<void> {
    const expiresInMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });

    const data: PasswordResetJobData = {
      userId: args.userId,
      email: args.email,
      userName: this.firstName(args.userName),
      resetUrl: this.buildUrl('/reset-password', args.rawToken),
      expiresInMinutes,
    };

    await this.enqueue(EMAIL_JOBS.PASSWORD_RESET, data);
  }

  async sendPasswordChanged(args: SendPasswordChangedArgs): Promise<void> {
    const data: PasswordChangedJobData = {
      userId: args.userId,
      email: args.email,
      userName: this.firstName(args.userName),
      changedAtIso: new Date().toISOString(),
      ipAddress: args.ipAddress,
    };

    await this.enqueue(EMAIL_JOBS.PASSWORD_CHANGED, data);
  }

  private async enqueue(
    jobName: (typeof EMAIL_JOBS)[keyof typeof EMAIL_JOBS],
    data: object,
  ): Promise<void> {
    try {
      await this.emailQueue.add(jobName, data, {
        priority: EMAIL_JOB_PRIORITY[jobName],
        jobId: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Email queue unavailable, skipping ${jobName}: ${message}`,
      );
    }
  }

  private buildUrl(path: string, token: string): string {
    const base = this.config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private firstName(name: string | null | undefined): string {
    if (!name) return '';
    return name.trim().split(/\s+/)[0] ?? '';
  }
}
