import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  JwtAuthGuard,
  RequirePermissions,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import { ZodValidationPipe } from '../../../shared/presentation/validation/zod-validation.pipe';

const listSchema = paginationQuerySchema.extend({
  type: z
    .enum([
      'matched',
      'amount_mismatch',
      'kind_mismatch',
      'missing_in_payco',
      'missing_at_provider',
    ])
    .optional(),
});

/** Dashboard (finance): reconciliation records. */
@ApiTags('Reconciliation')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'reconciliation', version: '1' })
export class ReconciliationController {
  @Get('records')
  @RequirePermissions('settlements:read')
  @ApiOperation({ summary: 'Reconciliation results and discrepancies (Phase 4)' })
  records(@Query(new ZodValidationPipe(listSchema)) _q: z.infer<typeof listSchema>) {
    return planned('reconciliation.records', 'Phase 4');
  }
}
