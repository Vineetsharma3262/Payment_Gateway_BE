import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from '../domain-ports/email-sender.port';

/**
 * Development/test adapter: records messages and logs metadata only (never
 * variables, which can contain single-use links). A real provider adapter is
 * selected once an email vendor is chosen.
 */
export class LoggingEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(
      { template: message.template, idempotencyKey: message.idempotencyKey },
      'email queued (dev)',
    );
    return Promise.resolve();
  }
}
