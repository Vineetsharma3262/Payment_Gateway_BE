import { ConcurrencyConflictError } from '../../shared/application/application-error';
import type { Clock } from '../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../shared/application/domain-event-publisher.port';
import type { IdGenerator, IdPrefix } from '../../shared/application/id-generator.port';
import type {
  IdempotencyClaim,
  IdempotencyScopeKey,
  IdempotencyStore,
  StoredOutcome,
} from '../../shared/application/idempotency.port';
import type { Hasher } from '../../shared/application/request-hash';
import type { UnitOfWork } from '../../shared/application/unit-of-work.port';
import type { DomainEvent } from '../../shared/domain/domain-event';
import { NodeHasher } from '../../shared/infrastructure/system/node-hasher';
import { Order, type OrderProps } from '../../modules/orders/domain/entities/order';
import type { OrderRepository } from '../../modules/orders/domain/repositories/order.repository';
import type {
  MerchantPaymentProfile,
  MerchantPaymentProfileReader,
} from '../../modules/merchants/public-api';

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-10-27T12:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  next(prefix: IdPrefix): string {
    return `${prefix}_${String(++this.counter).padStart(24, '0')}`;
  }
}

export class PassThroughUnitOfWork implements UnitOfWork {
  transactions = 0;
  run<T>(work: () => Promise<T>): Promise<T> {
    this.transactions++;
    return work();
  }
}

export class RecordingEventPublisher implements DomainEventPublisher {
  readonly events: DomainEvent[] = [];
  publish(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  types(): string[] {
    return this.events.map((e) => e.eventType);
  }
}

/** Mirrors PrismaOrderRepository semantics: merchant-scoped reads, optimistic versioning, snapshot storage. */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly rows = new Map<string, OrderProps>();

  findForMerchant(merchantId: string, orderId: string): Promise<Order | null> {
    const row = this.rows.get(orderId);
    return Promise.resolve(
      row && row.merchantId === merchantId ? Order.rehydrate({ ...row }) : null,
    );
  }

  findByProviderOrder(provider: string, providerOrderId: string): Promise<Order | null> {
    const row = [...this.rows.values()].find(
      (r) =>
        r.providerOrder?.provider === provider &&
        r.providerOrder.providerOrderId === providerOrderId,
    );
    return Promise.resolve(row ? Order.rehydrate({ ...row }) : null);
  }

  insert(order: Order): Promise<void> {
    if (this.rows.has(order.id)) return Promise.reject(new Error('duplicate order id'));
    this.rows.set(order.id, snapshot(order, 0));
    order.markPersisted(0);
    return Promise.resolve();
  }

  save(order: Order): Promise<void> {
    const stored = this.rows.get(order.id);
    if (!stored || stored.merchantId !== order.merchantId || stored.version !== order.version) {
      return Promise.reject(new ConcurrencyConflictError('order', order.id));
    }
    this.rows.set(order.id, snapshot(order, order.version + 1));
    order.markPersisted(order.version + 1);
    return Promise.resolve();
  }

  count(): number {
    return this.rows.size;
  }
}

function snapshot(order: Order, version: number): OrderProps {
  return {
    id: order.id,
    merchantId: order.merchantId,
    mode: order.mode,
    amount: order.amount,
    status: order.status,
    receipt: order.receipt,
    notes: order.notes,
    providerOrder: order.providerOrder,
    failureReason: order.failureReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version,
  };
}

interface IdemRecord {
  id: string;
  requestHash: string;
  resourceId: string | null;
  outcome: StoredOutcome | null;
  lockedUntil: number;
}

/** Mirrors PrismaIdempotencyStore semantics, including lease expiry and takeover. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdemRecord>();
  private sequence = 0;

  constructor(private readonly clock: Clock) {}

  claim(
    input: IdempotencyScopeKey & { requestHash: string; leaseMs: number },
  ): Promise<IdempotencyClaim> {
    const k = `${input.merchantId}|${input.scope}|${input.key}`;
    const now = this.clock.now().getTime();
    const existing = this.records.get(k);
    if (!existing) {
      const id = `idem_${++this.sequence}`;
      this.records.set(k, {
        id,
        requestHash: input.requestHash,
        resourceId: null,
        outcome: null,
        lockedUntil: now + input.leaseMs,
      });
      return Promise.resolve({ kind: 'claimed', recordId: id });
    }
    if (existing.requestHash !== input.requestHash)
      return Promise.resolve({ kind: 'payload_mismatch' });
    if (existing.outcome) return Promise.resolve({ kind: 'replay', outcome: existing.outcome });
    if (existing.lockedUntil > now) return Promise.resolve({ kind: 'in_progress' });
    existing.lockedUntil = now + input.leaseMs;
    return Promise.resolve({
      kind: 'resumed',
      recordId: existing.id,
      resourceId: existing.resourceId,
    });
  }

  attachResource(recordId: string, resourceId: string): Promise<void> {
    this.byId(recordId).resourceId = resourceId;
    return Promise.resolve();
  }

  complete(recordId: string, outcome: StoredOutcome): Promise<void> {
    // Round-trip through JSON like the jsonb column does.
    this.byId(recordId).outcome = JSON.parse(JSON.stringify(outcome)) as StoredOutcome;
    return Promise.resolve();
  }

  release(recordId: string): Promise<void> {
    const record = this.byId(recordId);
    if (!record.outcome) record.lockedUntil = this.clock.now().getTime();
    return Promise.resolve();
  }

  private byId(id: string): IdemRecord {
    const record = [...this.records.values()].find((r) => r.id === id);
    if (!record) throw new Error(`unknown idempotency record ${id}`);
    return record;
  }
}

export class InMemoryMerchantProfiles implements MerchantPaymentProfileReader {
  private readonly profiles = new Map<string, MerchantPaymentProfile>();

  add(profile: MerchantPaymentProfile): this {
    this.profiles.set(profile.merchantId, profile);
    return this;
  }

  getPaymentProfile(merchantId: string): Promise<MerchantPaymentProfile | null> {
    return Promise.resolve(this.profiles.get(merchantId) ?? null);
  }
}

export function activeMerchant(
  merchantId: string,
  overrides: Partial<MerchantPaymentProfile> = {},
): MerchantPaymentProfile {
  return {
    merchantId,
    status: 'active',
    liveChargesEnabled: true,
    providerAccounts: {
      test: { provider: 'fake', accountId: `acc_test_${merchantId}` },
      live: { provider: 'fake', accountId: `acc_live_${merchantId}` },
    },
    ...overrides,
  };
}

export const testHasher: Hasher = new NodeHasher();
