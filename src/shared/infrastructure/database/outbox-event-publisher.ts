import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DomainEventPublisher } from '../../application/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../application/id-generator.port';
import type { DomainEvent } from '../../domain/domain-event';
import { TransactionHost } from './transaction-host';

/**
 * Writes events to `outbox_events` in the caller's transaction. Refuses to run
 * outside one: an event written separately from its state change could be
 * published for state that was rolled back, or lost for state that committed.
 */
@Injectable()
export class OutboxEventPublisher implements DomainEventPublisher {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async publish(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (!this.host.inTransaction) {
      throw new Error('Domain events must be published inside a unit of work.');
    }
    await this.host.client.outboxEvent.createMany({
      data: events.map((event) => ({
        id: this.ids.next('evt'),
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        merchantId: event.merchantId,
        payload: event.payload as Prisma.InputJsonObject,
        occurredAt: event.occurredAt,
      })),
    });
  }
}
