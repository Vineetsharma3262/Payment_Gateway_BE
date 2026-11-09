import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

/**
 *   pending ──► processing ──► succeeded
 *      │  └──► (outcome unknown: stays pending, submission = unknown)
 *      └──────────────────────► failed
 *
 * `submission` records what PayCo knows about the gateway call:
 *   not_sent – safe to send (first attempt or gateway reported "unavailable")
 *   unknown  – a request may have reached the gateway; NEVER resend, reconcile
 *   sent     – gateway acknowledged
 */
export type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type SubmissionState = 'not_sent' | 'unknown' | 'sent';

export interface RefundProps {
  id: string;
  merchantId: string;
  paymentId: string;
  amount: Money;
  reason: string | null;
  status: RefundStatus;
  submission: SubmissionState;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class Refund extends AggregateRoot {
  private constructor(private props: RefundProps) {
    super(props.id, props.version);
  }

  static request(params: {
    id: string;
    merchantId: string;
    paymentId: string;
    amount: Money;
    reason?: string | null;
    now: Date;
  }): Refund {
    if (!params.amount.isPositive())
      throw new InvariantViolationError('Refund amount must be positive.');
    const refund = new Refund({
      id: params.id,
      merchantId: params.merchantId,
      paymentId: params.paymentId,
      amount: params.amount,
      reason: params.reason ?? null,
      status: 'pending',
      submission: 'not_sent',
      failureReason: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
    refund.emit('refund.created', params.now);
    return refund;
  }

  static rehydrate(props: RefundProps): Refund {
    return new Refund({ ...props });
  }

  get status(): RefundStatus {
    return this.props.status;
  }
  get submission(): SubmissionState {
    return this.props.submission;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get merchantId(): string {
    return this.props.merchantId;
  }
  get paymentId(): string {
    return this.props.paymentId;
  }

  canBeSent(): boolean {
    return this.props.status === 'pending' && this.props.submission === 'not_sent';
  }

  markSubmitted(providerStatus: 'pending' | 'processed' | 'failed', now: Date): void {
    this.assertPending();
    this.props.submission = 'sent';
    if (providerStatus === 'processed') return this.markSucceeded(now);
    if (providerStatus === 'failed') return this.markFailed('declined by processor', now);
    this.props.status = 'processing';
    this.props.updatedAt = now;
  }

  markOutcomeUnknown(now: Date): void {
    this.assertPending();
    this.props.submission = 'unknown';
    this.props.updatedAt = now;
    this.emit('refund.provider_sync_required', now);
  }

  markSucceeded(now: Date): void {
    if (this.props.status === 'succeeded') return;
    if (this.props.status === 'failed')
      throw new InvalidStateTransitionError('Refund', 'failed', 'succeeded');
    this.props.status = 'succeeded';
    this.props.submission = 'sent';
    this.props.updatedAt = now;
    this.emit('refund.succeeded', now);
  }

  markFailed(reason: string, now: Date): void {
    if (this.props.status === 'failed') return;
    if (this.props.status === 'succeeded')
      throw new InvalidStateTransitionError('Refund', 'succeeded', 'failed');
    this.props.status = 'failed';
    this.props.failureReason = reason.slice(0, 500);
    this.props.updatedAt = now;
    this.emit('refund.failed', now);
  }

  toProps(): RefundProps {
    return { ...this.props, version: this.version };
  }

  private assertPending(): void {
    if (this.props.status !== 'pending')
      throw new InvalidStateTransitionError('Refund', this.props.status, 'submitted');
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'refund',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        refundId: this.id,
        paymentId: this.props.paymentId,
        amountMinor: this.props.amount.amountMinor,
        currency: this.props.amount.currency,
        status: this.props.status,
      },
    });
  }
}
