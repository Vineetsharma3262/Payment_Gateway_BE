import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  DomainError,
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

export class SelfApprovalError extends DomainError {
  readonly code = 'SELF_APPROVAL_NOT_ALLOWED';

  constructor() {
    super('A payout cannot be approved by the person who created it.');
  }
}

/**
 * PRD 5.2 statuses `queued → processing → paid / returned / failed`, preceded
 * by an approval step when required.
 *
 *  pending_approval ─► queued ─► processing ─► paid ─► returned
 *        │                 └─────────┴───────► failed
 *        └─► rejected                 queued ─► canceled
 */
export type PayoutStatus =
  | 'pending_approval'
  | 'rejected'
  | 'queued'
  | 'canceled'
  | 'processing'
  | 'paid'
  | 'returned'
  | 'failed';
export type PayoutRail = 'ach' | 'same_day_ach' | 'rtp' | 'fednow' | 'wire' | 'push_to_card';

const TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending_approval: ['queued', 'rejected'],
  rejected: [],
  queued: ['processing', 'canceled', 'failed'],
  canceled: [],
  processing: ['paid', 'failed'],
  paid: ['returned'],
  returned: [],
  failed: [],
};

export interface PayoutProps {
  id: string;
  merchantId: string;
  recipientId: string;
  amount: Money;
  rail: PayoutRail;
  status: PayoutStatus;
  createdByUserId: string;
  approvedByUserId: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class Payout extends AggregateRoot {
  private constructor(private props: PayoutProps) {
    super(props.id, props.version);
  }

  static request(params: {
    id: string;
    merchantId: string;
    recipientId: string;
    amount: Money;
    rail: PayoutRail;
    createdByUserId: string;
    needsApproval: boolean;
    now: Date;
  }): Payout {
    if (!params.amount.isPositive())
      throw new InvariantViolationError('Payout amount must be positive.');
    const payout = new Payout({
      id: params.id,
      merchantId: params.merchantId,
      recipientId: params.recipientId,
      amount: params.amount,
      rail: params.rail,
      status: params.needsApproval ? 'pending_approval' : 'queued',
      createdByUserId: params.createdByUserId,
      approvedByUserId: null,
      failureReason: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
    payout.emit(params.needsApproval ? 'payout.approval_requested' : 'payout.queued', params.now);
    return payout;
  }

  get status(): PayoutStatus {
    return this.props.status;
  }

  /** Maker-checker: the approver must differ from the creator. */
  approve(approverUserId: string, now: Date): void {
    if (approverUserId === this.props.createdByUserId) throw new SelfApprovalError();
    this.transition('queued', now);
    this.props.approvedByUserId = approverUserId;
    this.emit('payout.queued', now);
  }

  reject(now: Date): void {
    this.transition('rejected', now);
    this.emit('payout.rejected', now);
  }

  cancel(now: Date): void {
    this.transition('canceled', now);
    this.emit('payout.canceled', now);
  }

  /** Partner status updates; repeats are ignored (at-least-once partner webhooks). */
  applyPartnerStatus(
    status: 'processing' | 'paid' | 'returned' | 'failed',
    reason: string | null,
    now: Date,
  ): void {
    if (status === this.props.status) return;
    this.transition(status, now);
    if (status === 'failed' || status === 'returned')
      this.props.failureReason = reason?.slice(0, 500) ?? null;
    this.emit(`payout.${status}`, now);
  }

  toProps(): PayoutProps {
    return { ...this.props, version: this.version };
  }

  private transition(next: PayoutStatus, now: Date): void {
    if (!TRANSITIONS[this.props.status].includes(next))
      throw new InvalidStateTransitionError('Payout', this.props.status, next);
    this.props.status = next;
    this.props.updatedAt = now;
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'payout',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        payoutId: this.id,
        amountMinor: this.props.amount.amountMinor,
        rail: this.props.rail,
        status: this.props.status,
      },
    });
  }
}
