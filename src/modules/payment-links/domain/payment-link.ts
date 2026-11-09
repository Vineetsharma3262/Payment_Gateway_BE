import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { DomainError, InvariantViolationError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

export class PaymentLinkNotUsableError extends DomainError {
  readonly code = 'PAYMENT_LINK_NOT_USABLE';

  constructor(status: string) {
    super(`This payment link cannot be used (${status}).`, { status });
  }
}

/**
 * Branded link hosted on PayCo's domain (PRD 5.1). The gateway order is created
 * only when a customer opens the link (PRD 7.1), so each use maps to one order.
 */
export type PaymentLinkStatus = 'active' | 'completed' | 'expired' | 'deactivated';

export interface PaymentLinkProps {
  id: string;
  merchantId: string;
  mode: 'test' | 'live';
  amount: Money;
  description: string;
  status: PaymentLinkStatus;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  createdAt: Date;
  version: number;
}

export class PaymentLink extends AggregateRoot {
  private constructor(private props: PaymentLinkProps) {
    super(props.id, props.version);
  }

  static create(params: Omit<PaymentLinkProps, 'status' | 'uses' | 'version'>): PaymentLink {
    if (!params.amount.isPositive())
      throw new InvariantViolationError('Link amount must be positive.');
    if (params.maxUses !== null && (!Number.isInteger(params.maxUses) || params.maxUses < 1)) {
      throw new InvariantViolationError('maxUses must be a positive integer.');
    }
    if (params.expiresAt && params.expiresAt <= params.createdAt) {
      throw new InvariantViolationError('Expiry must be in the future.');
    }
    if (params.description.trim().length === 0 || params.description.length > 500) {
      throw new InvariantViolationError('Description must be 1–500 characters.');
    }
    return new PaymentLink({ ...params, status: 'active', uses: 0, version: 0 });
  }

  /** Status as of `now` (expiry is evaluated lazily, no job required). */
  statusAt(now: Date): PaymentLinkStatus {
    if (this.props.status === 'active' && this.props.expiresAt && this.props.expiresAt <= now)
      return 'expired';
    return this.props.status;
  }

  /** A customer opened the link and an order was created for it. */
  recordUse(orderId: string, now: Date): void {
    const status = this.statusAt(now);
    if (status !== 'active') throw new PaymentLinkNotUsableError(status);
    this.props.uses += 1;
    if (this.props.maxUses !== null && this.props.uses >= this.props.maxUses)
      this.props.status = 'completed';
    this.record({
      eventType: 'payment_link.used',
      aggregateType: 'payment_link',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: { paymentLinkId: this.id, orderId, uses: this.props.uses },
    });
  }

  deactivate(): void {
    if (this.props.status === 'active') this.props.status = 'deactivated';
  }

  toProps(): PaymentLinkProps {
    return { ...this.props, version: this.version };
  }
}
