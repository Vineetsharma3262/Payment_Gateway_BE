import type { DomainEvent } from './domain-event';
import { Entity } from './entity';

/**
 * Consistency boundary. `version` supports optimistic concurrency: repositories
 * must persist only if the stored version still equals the loaded version.
 */
export abstract class AggregateRoot<TId extends string = string> extends Entity<TId> {
  private pendingEvents: DomainEvent[] = [];

  protected constructor(
    id: TId,
    private _version: number,
  ) {
    super(id);
  }

  get version(): number {
    return this._version;
  }

  protected record(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }

  /** Returns and clears events recorded since the aggregate was loaded. */
  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Called by repositories after a successful write. */
  markPersisted(newVersion: number): void {
    this._version = newVersion;
  }
}
