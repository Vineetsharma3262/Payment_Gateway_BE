import type { DomainEvent } from '../domain/domain-event';

/**
 * Persists domain events durably. The production implementation writes to the
 * transactional outbox inside the caller's unit of work; a relay worker then
 * publishes to SQS (at-least-once).
 */
export interface DomainEventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}

export const DOMAIN_EVENT_PUBLISHER = Symbol('DomainEventPublisher');
