import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { InvariantViolationError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';

/**
 * Payment lifecycle as reported by the gateway:
 *
 *   pending ─► authorized ─► captured
 *      │           │
 *      └──────► failed
 *
 * Provider events arrive at-least-once and out of order. `applyProviderStatus`
 * therefore only moves forward: a lower-ranked status after a higher one is
 * stale and ignored; repeating the current status is a duplicate. Refunds do
 * not change the status; they reduce `refundableAmount`.
 */
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed';
export type PaymentMethod = 'card' | 'apple_pay' | 'ach_debit';
export type ApplyOutcome = 'applied' | 'duplicate' | 'stale';

const RANK: Record<PaymentStatus, number> = { pending: 0, authorized: 1, captured: 2, failed: 2 };

export interface PaymentProps {
  id: string;
  merchantId: string;
  orderId: string;
  mode: 'test' | 'live';
  amount: Money;
  amountRefunded: Money;
  status: PaymentStatus;
  method: PaymentMethod | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class Payment extends AggregateRoot {
  private constructor(private props: PaymentProps) {
    super(props.id, props.version);
  }

  static open(params: {
    id: string;
    merchantId: string;
    orderId: string;
    mode: 'test' | 'live';
    amount: Money;
    method: PaymentMethod | null;
    now: Date;
  }): Payment {
    if (!params.amount.isPositive())
      throw new InvariantViolationError('Payment amount must be positive.');
    return new Payment({
      ...params,
      amountRefunded: Money.zero(params.amount.currency),
      status: 'pending',
      failureReason: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
  }

  static rehydrate(props: PaymentProps): Payment {
    return new Payment({ ...props });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get status(): PaymentStatus {
    return this.props.status;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get amountRefunded(): Money {
    return this.props.amountRefunded;
  }

  refundableAmount(): Money {
    return this.props.status === 'captured'
      ? this.props.amount.subtract(this.props.amountRefunded)
      : Money.zero(this.props.amount.currency);
  }

  applyProviderStatus(
    next: PaymentStatus,
    details: { failureReason?: string | null },
    now: Date,
  ): ApplyOutcome {
    const current = this.props.status;
    if (next === current) return 'duplicate';
    if (current === 'failed' || current === 'captured') return 'stale'; // terminal for status purposes
    if (RANK[next] < RANK[current]) return 'stale';

    this.props.status = next;
    this.props.updatedAt = now;
    if (next === 'failed')
      this.props.failureReason = details.failureReason?.slice(0, 500) ?? 'unknown';
    this.emit(`payment.${next}`, now);
    return 'applied';
  }

  /** Called when a refund succeeds at the gateway. */
  recordRefund(amount: Money, now: Date): void {
    if (!amount.isPositive()) throw new InvariantViolationError('Refund amount must be positive.');
    if (amount.greaterThan(this.refundableAmount())) {
      throw new InvariantViolationError('Refund exceeds the refundable amount.', {
        refundable: this.refundableAmount().amountMinor,
        requested: amount.amountMinor,
      });
    }
    this.props.amountRefunded = this.props.amountRefunded.add(amount);
    this.props.updatedAt = now;
    this.emit('payment.refunded', now, { refundedMinor: amount.amountMinor });
  }

  toProps(): PaymentProps {
    return { ...this.props, version: this.version };
  }

  private emit(eventType: string, now: Date, extra: Record<string, unknown> = {}): void {
    this.record({
      eventType,
      aggregateType: 'payment',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        paymentId: this.id,
        orderId: this.props.orderId,
        mode: this.props.mode,
        amountMinor: this.props.amount.amountMinor,
        currency: this.props.amount.currency,
        status: this.props.status,
        ...extra,
      },
    });
  }
}
