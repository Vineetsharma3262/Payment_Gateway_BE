/**
 * Transactional email (PRD §4: receipts and emails are sent by PayCo, gateway
 * emails turned off). Templates are rendered by the Notifications context;
 * the sender only delivers.
 */
export interface EmailMessage {
  to: string;
  template: string;
  /** Template variables. Must not contain secrets other than single-use links the template needs. */
  variables: Record<string, string>;
  /** Stable id so a retried send is deduplicated by the provider where supported. */
  idempotencyKey: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EmailSender');
