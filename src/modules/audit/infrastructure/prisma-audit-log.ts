import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsRequestContext } from '../../../shared/infrastructure/observability/request-context';
import type { AuditEntry, AuditLog } from '../../../shared/application/audit-log.port';
import { CLOCK, type Clock } from '../../../shared/application/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/application/id-generator.port';
import { toPage, type Page, type PageRequest } from '../../../shared/application/pagination';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import type { AuditFilter, AuditQuery, AuditRecordDto } from '../application/audit-query';

/** Insert-only; the table rejects UPDATE/DELETE with a trigger. Joins the caller's transaction. */
@Injectable()
export class PrismaAuditLog implements AuditLog, AuditQuery {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.host.client.auditRecord.create({
      data: {
        id: this.ids.next('aud'),
        merchantId: entry.merchantId,
        actorType: entry.actor.type,
        actorId: entry.actor.id,
        action: entry.action,
        resourceType: entry.resource.type,
        resourceId: entry.resource.id,
        requestId: ClsRequestContext.requestId() ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonObject,
        occurredAt: this.clock.now(),
      },
    });
  }

  async search(filter: AuditFilter, page: PageRequest): Promise<Page<AuditRecordDto>> {
    const rows = await this.host.client.auditRecord.findMany({
      where: {
        merchantId: filter.merchantId,
        resourceType: filter.resourceType,
        resourceId: filter.resourceId,
        action: filter.action,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.startingAfter ? { cursor: { id: page.startingAfter }, skip: 1 } : {}),
    });
    return toPage(
      rows.map((r) => ({
        ...r,
        metadata: r.metadata as Record<string, unknown>,
        occurredAt: r.occurredAt.toISOString(),
      })),
      page.limit,
    );
  }
}
