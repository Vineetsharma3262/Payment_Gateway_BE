import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  JwtAuthGuard,
  RequirePlatformAdmin,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import { ZodValidationPipe } from '../../../shared/presentation/validation/zod-validation.pipe';
import { AUDIT_QUERY, type AuditQuery } from '../application/audit-query';

const querySchema = paginationQuerySchema.extend({
  merchant_id: z.string().max(40).optional(),
  resource_type: z.string().max(50).optional(),
  resource_id: z.string().max(40).optional(),
  action: z.string().max(100).optional(),
});

/** Internal administrators only. */
@ApiTags('Admin')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@RequirePlatformAdmin()
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AdminAuditController {
  constructor(@Inject(AUDIT_QUERY) private readonly audit: AuditQuery) {}

  @Get()
  @ApiOperation({ summary: 'Search the audit trail' })
  async search(@Query(new ZodValidationPipe(querySchema)) q: z.infer<typeof querySchema>) {
    const page = await this.audit.search(
      {
        merchantId: q.merchant_id,
        resourceType: q.resource_type,
        resourceId: q.resource_id,
        action: q.action,
      },
      { limit: q.limit, startingAfter: q.starting_after },
    );
    return {
      ...page,
      items: page.items.map((r) => ({
        id: r.id,
        merchant_id: r.merchantId,
        actor: { type: r.actorType, id: r.actorId },
        action: r.action,
        resource: { type: r.resourceType, id: r.resourceId },
        request_id: r.requestId,
        metadata: r.metadata,
        occurred_at: r.occurredAt,
      })),
    };
  }
}
