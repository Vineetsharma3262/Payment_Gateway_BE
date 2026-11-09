import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { EmailMessage, EmailSender } from '../domain-ports/email-sender.port';
import type { TemplateStore } from '../template-loader';

/**
 * Resend adapter. Renders the template from `TemplateStore` and delivers via
 * Resend's HTTPS API. Idempotency: Resend accepts the `Idempotency-Key`
 * header, so retried sends are de-duplicated server-side.
 */
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger('ResendEmailSender');
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | undefined,
    private readonly templates: TemplateStore,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const rendered = this.templates.render(message.template, message.variables);
    const result = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      },
      // Second argument is `RequestOptions` — Resend reads this header and
      // treats a repeat send with the same key as a no-op.
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error) {
      // The provider gave us a reason to retry (`rate_limit`, `invalid_from`,
      // transient `internal_server_error`, …). Caller decides retry policy.
      this.logger.warn(
        {
          template: message.template,
          idempotencyKey: message.idempotencyKey,
          code: result.error.name,
        },
        'resend send failed',
      );
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
    this.logger.log(
      {
        template: message.template,
        idempotencyKey: message.idempotencyKey,
        messageId: result.data?.id,
      },
      'email sent via Resend',
    );
  }
}
