import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  JwtAuthGuard,
  RequirePermissions,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import { ZodValidationPipe } from '../../../shared/presentation/validation/zod-validation.pipe';

const rangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() }).strict();

/**
 * Dashboard reporting (PRD 5.4). Read models built from events and the ledger;
 * never an authoritative source for money.
 */
@ApiTags('Reports')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  @Get('summary')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Home metrics: volume, payments, refunds, fees (Phase 5)' })
  summary(@Query(new ZodValidationPipe(rangeSchema)) _q: z.infer<typeof rangeSchema>) {
    return planned('reports.summary', 'Phase 5');
  }
}
