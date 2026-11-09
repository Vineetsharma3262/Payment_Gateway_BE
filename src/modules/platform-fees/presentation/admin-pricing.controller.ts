import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  JwtAuthGuard,
  RequirePlatformAdmin,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import { DEFAULT_PAYCO_SCHEDULE, type FeeSchedule } from '../domain/fee-schedule';

const scheduleSchema = z
  .object({
    name: z.string().min(3).max(100),
    effective_from: z.iso.datetime(),
    card_bps: z.number().int().min(0).max(2000),
    card_fixed_cents: z.number().int().min(0).max(1000),
    foreign_card_surcharge_bps: z.number().int().min(0).max(1000),
    ach_debit_bps: z.number().int().min(0).max(2000),
    ach_debit_cap_cents: z.number().int().min(0).max(100_000),
    ach_return_cents: z.number().int().min(0).max(10_000),
  })
  .strict();

function scheduleResponse(s: FeeSchedule) {
  const p = s.toProps();
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    effective_from: p.effectiveFrom.toISOString(),
    card_bps: p.rates.card.bps,
    card_fixed_cents: p.rates.card.fixedCents,
    foreign_card_surcharge_bps: p.rates.foreignCardSurchargeBps,
    ach_debit_bps: p.rates.achDebit.bps,
    ach_debit_cap_cents: p.rates.achDebit.capCents,
    ach_return_cents: p.rates.achReturnCents,
  };
}

/** Internal administrators: pricing configuration. */
@ApiTags('Admin')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@RequirePlatformAdmin()
@Controller({ path: 'admin/pricing/fee-schedules', version: '1' })
export class AdminPricingController {
  @Get()
  @ApiOperation({ summary: 'List fee schedules (currently the default PRD §9 proposal)' })
  list() {
    return [scheduleResponse(DEFAULT_PAYCO_SCHEDULE)];
  }

  @Post()
  @ApiOperation({ summary: 'Create a new fee schedule version (Phase 4)' })
  @ApiBody({ schema: toOpenApiSchema(scheduleSchema) })
  create(@Body(new ZodValidationPipe(scheduleSchema)) _b: z.infer<typeof scheduleSchema>) {
    return planned('pricing.fee_schedules.create', 'Phase 4');
  }
}
