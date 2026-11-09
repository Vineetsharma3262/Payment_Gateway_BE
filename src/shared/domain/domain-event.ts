/**
 * A fact that happened inside an aggregate. Events are recorded on the aggregate
 * and written to the transactional outbox in the same database transaction as
 * the state change, so they are never lost and never published for rolled-back state.
 */
export interface DomainEvent<TPayload extends object = Record<string, unknown>> {
  /** Stable, dot-separated event name, e.g. `order.created`. */
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  /** Owning tenant. Every event in PayCo is merchant-scoped. */
  readonly merchantId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}
