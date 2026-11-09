import { join } from 'node:path';
import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { LoggingEmailSender } from '../../integrations/notifications/adapters/logging-email-sender';
import { ResendEmailSender } from '../../integrations/notifications/adapters/resend-email-sender';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../integrations/notifications/domain-ports/email-sender.port';
import {
  FileTemplateStore,
  TEMPLATE_STORE,
  type TemplateStore,
} from '../../integrations/notifications/template-loader';
import {
  SECRETS_PROVIDER,
  type SecretsProvider,
} from '../../shared/application/secrets.port';

/** Add here as new templates are authored under `templates/<name>/`. */
export const TEMPLATE_NAMES = [
  'password_reset',
  'user_invitation',
  'user_password_reset',
] as const;

/**
 * Notifications context. Phase 3 selects the email provider from configuration:
 *
 * - `EMAIL_PROVIDER=log` (default)   — writes to the server log, nothing leaves
 *   the host. Used in dev / test / CI.
 * - `EMAIL_PROVIDER=resend`          — delivers through Resend. Requires the
 *   secret `resend/api-key` (env var `SECRET_RESEND_API_KEY` when
 *   `SECRETS_PROVIDER=env`).
 *
 * Templates are loaded from `src/integrations/notifications/templates/<name>/`
 * at module construction. See `template-loader.ts` for the file contract.
 */
@Global()
@Module({
  providers: [
    {
      provide: TEMPLATE_STORE,
      useFactory: (): TemplateStore =>
        new FileTemplateStore(
          join(__dirname, '..', '..', 'integrations', 'notifications', 'templates'),
          TEMPLATE_NAMES,
        ),
    },
    {
      provide: EMAIL_SENDER,
      inject: [APP_CONFIG, SECRETS_PROVIDER, TEMPLATE_STORE],
      useFactory: async (
        config: AppConfig,
        secrets: SecretsProvider,
        templates: TemplateStore,
      ): Promise<EmailSender> => {
        const logger = new Logger('Notifications');
        if (config.email.provider === 'resend') {
          const apiKey = await secrets.getString('resend/api-key');
          logger.log(
            { from: config.email.from, templates: templates.names() },
            'Resend email provider enabled',
          );
          return new ResendEmailSender(apiKey, config.email.from, config.email.replyTo, templates);
        }
        if (config.isProductionLike) {
          logger.warn('EMAIL_PROVIDER=log in production: emails are not delivered.');
        }
        return new LoggingEmailSender();
      },
    },
  ],
  exports: [EMAIL_SENDER, TEMPLATE_STORE],
})
export class NotificationsModule {}
