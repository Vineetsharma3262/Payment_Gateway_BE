import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

/**
 * Subscriptions in PayCo's layer (PRD 5.1): schedules and retries using saved
 * payment methods. Dunning: retry 1, 3 and 5 days after a failed charge, then
 * cancel.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';
export type BillingInterval = 'month' | 'year';

export const RETRY_DAYS = [1, 3, 5] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionProps {
  id: string;
  merchantId: string;
  customerId: string;
  amount: Money;
  interval: BillingInterval;
  intervalCount: number;
  /** Day of month the subscription started on, kept to avoid drift after short months. */
  anchorDay: number;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  failedAttempts: number;
  nextRetryAt: Date | null;
  version: number;
}

/** Adds months in UTC, clamping to the last day of shorter months (Jan 31 → Feb 28/29). */
export function addMonthsClamped(from: Date, months: number, anchorDay: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(anchorDay, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
}

export class Subscription extends AggregateRoot {
  private constructor(private props: SubscriptionProps) {
    super(props.id, props.version);
  }

  static start(params: {
    id: string;
    merchantId: string;
    customerId: string;
    amount: Money;
    interval: BillingInterval;
    intervalCount: number;
    startAt: Date;
  }): Subscription {
    if (!params.amount.isPositive())
      throw new InvariantViolationError('Subscription amount must be positive.');
    if (
      !Number.isInteger(params.intervalCount) ||
      params.intervalCount < 1 ||
      params.intervalCount > 12
    ) {
      throw new InvariantViolationError('Interval count must be 1–12.');
    }
    const anchorDay = params.startAt.getUTCDate();
    const months = params.interval === 'month' ? params.intervalCount : params.intervalCount * 12;
    return new Subscription({
      ...params,
      anchorDay,
      status: 'active',
      currentPeriodEnd: addMonthsClamped(params.startAt, months, anchorDay),
      failedAttempts: 0,
      nextRetryAt: null,
      version: 0,
    });
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }
  get currentPeriodEnd(): Date {
    return this.props.currentPeriodEnd;
  }
  get nextRetryAt(): Date | null {
    return this.props.nextRetryAt;
  }

  isDue(now: Date): boolean {
    if (this.props.status === 'canceled') return false;
    return this.props.nextRetryAt
      ? this.props.nextRetryAt <= now
      : this.props.currentPeriodEnd <= now;
  }

  recordChargeSucceeded(now: Date): void {
    if (this.props.status === 'canceled')
      throw new InvalidStateTransitionError('Subscription', 'canceled', 'renewed');
    const months =
      this.props.interval === 'month' ? this.props.intervalCount : this.props.intervalCount * 12;
    this.props.currentPeriodEnd = addMonthsClamped(
      this.props.currentPeriodEnd,
      months,
      this.props.anchorDay,
    );
    this.props.status = 'active';
    this.props.failedAttempts = 0;
    this.props.nextRetryAt = null;
    this.emit('subscription.renewed', now);
  }

  recordChargeFailed(now: Date): void {
    if (this.props.status === 'canceled') return;
    const retryIndex = this.props.failedAttempts;
    this.props.failedAttempts += 1;
    if (retryIndex < RETRY_DAYS.length) {
      this.props.status = 'past_due';
      this.props.nextRetryAt = new Date(now.getTime() + RETRY_DAYS[retryIndex] * DAY_MS);
      this.emit('subscription.past_due', now);
    } else {
      this.cancel(now);
    }
  }

  cancel(now: Date): void {
    if (this.props.status === 'canceled') return;
    this.props.status = 'canceled';
    this.props.nextRetryAt = null;
    this.emit('subscription.canceled', now);
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'subscription',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        subscriptionId: this.id,
        status: this.props.status,
        currentPeriodEnd: this.props.currentPeriodEnd.toISOString(),
      },
    });
  }
}
