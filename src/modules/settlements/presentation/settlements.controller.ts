import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiKeyAuthGuard } from '../../../shared/presentation/guards/api-key-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import { ZodValidationPipe } from '../../../shared/presentation/validation/zod-validation.pipe';

const listSchema = paginationQuerySchema.extend({
  status: z.enum(['created', 'processed', 'failed']).optional(),
});

/** Merchant API: settlements with fees (PRD 5.1, 7.1). */
@ApiTags('Settlements')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyAuthGuard)
@Controller({ path: 'settlements', version: '1' })
export class SettlementsController {
  @Get()
  @ApiOperation({ summary: 'List settlements to your bank account, with fees (Phase 4)' })
  list(@Query(new ZodValidationPipe(listSchema)) _q: z.infer<typeof listSchema>) {
    return planned('settlements.list', 'Phase 4');
  }
}
