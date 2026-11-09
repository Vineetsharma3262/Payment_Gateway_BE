import { Body, Controller, Get, Inject, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { UserContext } from '../../../shared/application/user-context';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import {
  JwtAuthGuard,
  RequirePermissions,
  RequirePlatformAdmin,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import type { MerchantDto, MerchantUseCases } from '../application/merchant.use-cases';
import { PAYMENT_METHODS } from '../domain/merchant';
import { MERCHANT_USE_CASES } from '../merchants.tokens';

const settingsSchema = z
  .object({
    display_name: z.string().trim().min(2).max(200).optional(),
    brand_color: z.string().nullable().optional(),
    logo_url: z.string().max(500).nullable().optional(),
    statement_descriptor: z.string().nullable().optional(),
    payment_methods: z.array(z.enum(PAYMENT_METHODS)).min(1).optional(),
  })
  .strict();
const statusSchema = z
  .object({
    status: z.enum(['active', 'suspended', 'closed']),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const feeScheduleSchema = z.object({ fee_schedule_id: z.string().max(40).nullable() }).strict();
const listSchema = paginationQuerySchema.extend({
  status: z.enum(['onboarding', 'active', 'suspended', 'closed']).optional(),
});

export function merchantResponse(m: MerchantDto) {
  return {
    id: m.id,
    object: 'merchant',
    legal_name: m.legalName,
    display_name: m.displayName,
    status: m.status,
    live_charges_enabled: m.liveChargesEnabled,
    branding: { brand_color: m.brandColor, logo_url: m.logoUrl },
    statement_descriptor: m.statementDescriptor,
    payment_methods: m.paymentMethods,
    created_at: m.createdAt,
  };
}

/** Dashboard: the signed-in merchant's own settings. */
@ApiTags('Merchant')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'merchant', version: '1' })
export class MerchantController {
  constructor(@Inject(MERCHANT_USE_CASES) private readonly merchants: MerchantUseCases) {}

  @Get()
  @RequirePermissions('merchant:read')
  @ApiOperation({ summary: 'Get merchant profile and settings' })
  async get(@CurrentUser() user: UserContext) {
    return merchantResponse(await this.merchants.get(user.merchantId!));
  }

  @Patch('settings')
  @RequirePermissions('merchant:write')
  @ApiOperation({ summary: 'Update branding, statement descriptor and payment methods' })
  @ApiBody({ schema: toOpenApiSchema(settingsSchema) })
  async update(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
  ) {
    const dto = await this.merchants.updateSettings(
      user.merchantId!,
      {
        displayName: body.display_name,
        brandColor: body.brand_color,
        logoUrl: body.logo_url,
        statementDescriptor: body.statement_descriptor,
        paymentMethods: body.payment_methods,
      },
      { type: 'user', id: user.userId },
    );
    return merchantResponse(dto);
  }
}

/** Internal administrators only. */
@ApiTags('Admin')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@RequirePlatformAdmin()
@Controller({ path: 'admin/merchants', version: '1' })
export class AdminMerchantsController {
  constructor(@Inject(MERCHANT_USE_CASES) private readonly merchants: MerchantUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List merchants' })
  async list(@Query(new ZodValidationPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const page = await this.merchants.list(
      { status: q.status },
      { limit: q.limit, startingAfter: q.starting_after },
    );
    return {
      ...page,
      items: page.items.map((m) => ({ ...merchantResponse(m), fee_schedule_id: m.feeScheduleId })),
    };
  }

  @Get(':merchantId')
  @ApiOperation({ summary: 'Get a merchant' })
  async get(@Param('merchantId') merchantId: string) {
    const m = await this.merchants.get(merchantId);
    return { ...merchantResponse(m), fee_schedule_id: m.feeScheduleId };
  }

  @Patch(':merchantId/status')
  @ApiOperation({ summary: 'Suspend, reactivate or close a merchant (audited)' })
  @ApiBody({ schema: toOpenApiSchema(statusSchema) })
  async status(
    @CurrentUser() user: UserContext,
    @Param('merchantId') merchantId: string,
    @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>,
  ) {
    return merchantResponse(
      await this.merchants.changeStatus(merchantId, body.status, body.reason, {
        type: 'user',
        id: user.userId,
      }),
    );
  }

  @Put(':merchantId/fee-schedule')
  @ApiOperation({ summary: 'Assign a pricing (fee) schedule (audited)' })
  @ApiBody({ schema: toOpenApiSchema(feeScheduleSchema) })
  async feeSchedule(
    @CurrentUser() user: UserContext,
    @Param('merchantId') merchantId: string,
    @Body(new ZodValidationPipe(feeScheduleSchema)) body: z.infer<typeof feeScheduleSchema>,
  ) {
    const m = await this.merchants.assignFeeSchedule(merchantId, body.fee_schedule_id, {
      type: 'user',
      id: user.userId,
    });
    return { ...merchantResponse(m), fee_schedule_id: m.feeScheduleId };
  }
}
