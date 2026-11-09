import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CLOCK, type Clock } from '../../application/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../application/id-generator.port';
import type {
  IdempotencyClaim,
  IdempotencyScopeKey,
  IdempotencyStore,
  StoredOutcome,
} from '../../application/idempotency.port';
import { TransactionHost } from '../database/transaction-host';

/** Keys are honoured for 24 hours; a scheduled cleanup removes expired records. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * INSERT … ON CONFLICT DO NOTHING (skipDuplicates) does not abort the
   * surrounding transaction on a duplicate. A concurrent insert of the same key
   * blocks until the other transaction resolves, so exactly one caller claims it.
   */
  async claim(
    input: IdempotencyScopeKey & { requestHash: string; leaseMs: number },
  ): Promise<IdempotencyClaim> {
    const db = this.host.client;
    const now = this.clock.now();
    const newId = this.ids.next('idem');
    const lockedUntil = new Date(now.getTime() + input.leaseMs);

    await db.idempotencyRecord.createMany({
      data: [
        {
          id: newId,
          merchantId: input.merchantId,
          scope: input.scope,
          key: input.key,
          requestHash: input.requestHash,
          lockedUntil,
          expiresAt: new Date(now.getTime() + RETENTION_MS),
        },
      ],
      skipDuplicates: true,
    });

    const record = await db.idempotencyRecord.findUniqueOrThrow({
      where: {
        merchantId_scope_key: { merchantId: input.merchantId, scope: input.scope, key: input.key },
      },
    });

    if (record.id === newId) return { kind: 'claimed', recordId: newId };
    if (record.requestHash !== input.requestHash) return { kind: 'payload_mismatch' };
    if (record.outcome !== null)
      return { kind: 'replay', outcome: record.outcome as StoredOutcome };
    if (record.lockedUntil > now) return { kind: 'in_progress' };

    // Lease expired: take it over atomically (compare-and-set on the old lease).
    const taken = await db.idempotencyRecord.updateMany({
      where: { id: record.id, lockedUntil: record.lockedUntil, completedAt: null },
      data: { lockedUntil },
    });
    return taken.count === 1
      ? { kind: 'resumed', recordId: record.id, resourceId: record.resourceId }
      : { kind: 'in_progress' };
  }

  async attachResource(recordId: string, resourceId: string): Promise<void> {
    await this.host.client.idempotencyRecord.update({
      where: { id: recordId },
      data: { resourceId },
    });
  }

  async complete(recordId: string, outcome: StoredOutcome): Promise<void> {
    await this.host.client.idempotencyRecord.update({
      where: { id: recordId },
      data: { outcome: outcome as Prisma.InputJsonObject, completedAt: this.clock.now() },
    });
  }

  async release(recordId: string): Promise<void> {
    await this.host.client.idempotencyRecord.updateMany({
      where: { id: recordId, completedAt: null },
      data: { lockedUntil: this.clock.now() },
    });
  }
}
