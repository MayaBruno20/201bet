import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.validation';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { DailyRateLimiter } from './daily-rate-limiter';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { BrevoProvider } from './providers/brevo.provider';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';
import { MailtrapProvider } from './providers/mailtrap.provider';
import { NoopProvider } from './providers/noop.provider';
import { TemplateRenderer } from './template-renderer';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL })],
  providers: [
    TemplateRenderer,
    DailyRateLimiter,
    BrevoProvider,
    MailtrapProvider,
    NoopProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: ConfigService<AppEnv, true>,
        brevo: BrevoProvider,
        mailtrap: MailtrapProvider,
        noop: NoopProvider,
      ) => {
        const selected = config.get('EMAIL_PROVIDER', { infer: true });
        switch (selected) {
          case 'brevo':
            return brevo;
          case 'mailtrap':
            return mailtrap;
          case 'noop':
          default:
            return noop;
        }
      },
      inject: [ConfigService, BrevoProvider, MailtrapProvider, NoopProvider],
    },
    MailService,
    MailProcessor,
  ],
  exports: [MailService, BullModule],
})
export class MailModule {}
