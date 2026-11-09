import { nextWebhookAttemptAt } from '../../../shared/domain/retry-policy';
import { Entity } from '../../../shared/domain/entity';

/**
 * One event to one endpoint. Delivery is at-least-once: the same `eventId` may
 * arrive more than once and merchants deduplicate on it. Retries use
 * exponential backoff with jitter for up to 24 hours (PRD 7.3); afterwards the
 * delivery is `exhausted` and can be replayed manually.
 */
export type DeliveryStatus = 'pending' | 'succeeded' | 'exhausted';

export interface DeliveryAttempt {
  at: Date;
  statusCode: number | null;
  durationMs: number;
  error: string | null;
}

export interface WebhookDeliveryProps {
  id: string;
  merchantId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  firstAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
}

export class WebhookDelivery extends Entity {
  private constructor(private props: WebhookDeliveryProps) {
    super(props.id);
  }

  static schedule(
    params: Pick<
      WebhookDeliveryProps,
      'id' | 'merchantId' | 'endpointId' | 'eventId' | 'eventType' | 'createdAt'
    >,
  ): WebhookDelivery {
    return new WebhookDelivery({
      ...params,
      status: 'pending',
      attempts: [],
      firstAttemptAt: null,
      nextAttemptAt: params.createdAt,
    });
  }

  static rehydrate(props: WebhookDeliveryProps): WebhookDelivery {
    return new WebhookDelivery({ ...props, attempts: [...props.attempts] });
  }

  get status(): DeliveryStatus {
    return this.props.status;
  }
  get nextAttemptAt(): Date | null {
    return this.props.nextAttemptAt;
  }
  get attemptCount(): number {
    return this.props.attempts.length;
  }

  /** 2xx = delivered. Anything else (incl. timeouts, redirects) is retried. */
  recordAttempt(attempt: DeliveryAttempt, random: () => number = Math.random): void {
    if (this.props.status !== 'pending') return;
    this.props.attempts.push({ ...attempt, error: attempt.error?.slice(0, 500) ?? null });
    this.props.firstAttemptAt ??= attempt.at;
    if (attempt.statusCode !== null && attempt.statusCode >= 200 && attempt.statusCode < 300) {
      this.props.status = 'succeeded';
      this.props.nextAttemptAt = null;
      return;
    }
    const next = nextWebhookAttemptAt(
      this.props.firstAttemptAt,
      this.props.attempts.length,
      attempt.at,
      random,
    );
    if (next) {
      this.props.nextAttemptAt = next;
    } else {
      this.props.status = 'exhausted';
      this.props.nextAttemptAt = null;
    }
  }

  /** Manual replay (audited by the caller): a fresh 24-hour window. */
  replay(now: Date): void {
    this.props.status = 'pending';
    this.props.firstAttemptAt = null;
    this.props.nextAttemptAt = now;
  }

  toProps(): WebhookDeliveryProps {
    return { ...this.props, attempts: [...this.props.attempts] };
  }
}
