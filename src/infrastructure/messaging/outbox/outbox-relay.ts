import type { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { MessagePublisher } from '../../../shared/application/messaging/message-publisher.port';
import { backoffWithJitter } from '../../../shared/domain/retry-policy';

interface ClaimedEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  merchant_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  attempts: number;
}

export interface OutboxRelayOptions {
  batchSize: number;
  /** Rows are leased for this long; a crashed relay's rows become visible again afterwards. */
  leaseMs: number;
}

/**
 * Moves committed outbox rows to the message bus. Several relay processes may
 * run concurrently: rows are claimed with FOR UPDATE SKIP LOCKED and leased by
 * pushing `next_attempt_at` forward, so each row is normally sent by one relay.
 * A crash between send and mark causes a duplicate send, never a lost event.
 */
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: MessagePublisher,
    private readonly options: OutboxRelayOptions = { batchSize: 50, leaseMs: 30_000 },
  ) {}

  /** Returns the number of events published. */
  async runOnce(): Promise<number> {
    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE outbox_events SET next_attempt_at = now() + (${this.options.leaseMs}::int * interval '1 millisecond')
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE published_at IS NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, event_type, aggregate_type, aggregate_id, merchant_id, payload, occurred_at, attempts`;

    let published = 0;
    for (const event of claimed) {
      try {
        await this.publisher.publish({
          id: event.id,
          type: event.event_type,
          groupId: `${event.aggregate_type}:${event.aggregate_id}`,
          body: {
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
            merchantId: event.merchant_id,
            occurredAt: event.occurred_at.toISOString(),
            payload: event.payload,
          },
        });
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
        published++;
      } catch (error) {
        const delay = 1_000 + backoffWithJitter(event.attempts, { baseMs: 1_000, capMs: 300_000 });
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + delay),
            lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          },
        });
      }
    }
    return published;
  }
}
